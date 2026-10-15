#!/usr/bin/env bash
# Runs the checks a commit must pass and stops at the first failure.
#
#   scripts/check.sh           everything: lint and format on all files
#   scripts/check.sh --staged  the pre-commit hook: lint and format only on staged files,
#                              and only the parts of the repo the commit touches
#
# Lint and format run on staged files only because the tree still has older
# violations; the type check and tests always cover everything they own.
set -euo pipefail

root=$(git rev-parse --show-toplevel)
cd "$root"

staged_only=false
[ "${1:-}" = "--staged" ] && staged_only=true

if $staged_only; then
  mapfile -t files < <(git diff --cached --name-only --diff-filter=ACMR)
else
  mapfile -t files < <(git ls-files)
fi

# in_dir prints the files under $1 matching the extended regex $2, relative to $1.
in_dir() {
  printf '%s\n' "${files[@]}" | grep -E "^$1/.*$2" | sed "s#^$1/##" || true
}

step() { printf '\n==> %s\n' "$1"; }

read_env() {
  [ -f web/.env ] || return 0
  sed -n "s/^[[:space:]]*$1=//p" web/.env | tail -n 1 | sed -e 's/^"//' -e 's/"$//'
}

mapfile -t web_files < <(in_dir web '')
mapfile -t prisma_files < <(in_dir web/prisma '')
mapfile -t db_call_files < <(in_dir web/src/lib '(dbFunctions|experienceQueries)\.ts$')
mapfile -t py_files < <(in_dir pyworker '\.py$')

if [ ${#web_files[@]} -gt 0 ]; then
  mapfile -t lintable < <(in_dir web '\.(ts|mjs|js|astro)$')
  cd web
  if [ ${#lintable[@]} -gt 0 ]; then
    step "eslint"
    if $staged_only; then npx eslint "${lintable[@]}"; else npx eslint .; fi
  fi
  step "prettier"
  if $staged_only; then npx prettier --check --ignore-unknown "${web_files[@]}"; else npx prettier --check .; fi
  # Calls into the SQL functions must go through src/lib/dbFunctions.ts, which test-db-functions.ts runs through
  # Prisma; a call anywhere else would skip that check of its parameter types.
  step "database function calls"
  sql_functions=$(sed -n 's/^CREATE OR REPLACE FUNCTION \([a-z_]*\)(.*/\1/p' prisma/triggers/*.sql | sort -u | paste -sd'|')
  if grep -rnE "\b($sql_functions)\(" src --include='*.ts' --include='*.astro' | grep -v '^src/lib/dbFunctions.ts:' | grep -vE '^[^:]+:[0-9]+:\s*(//|\*)'; then
    echo "Call SQL functions through src/lib/dbFunctions.ts." >&2
    exit 1
  fi
  # server-init runs under plain Node in production, where an astro: import stops it at startup.
  step "server-init bundle"
  server_init_bundle=$(mktemp --suffix=.mjs)
  npx esbuild src/server-init.ts --bundle --platform=node --format=esm --packages=external \
    --outfile="$server_init_bundle" --log-level=error
  if grep -n 'from "astro:' "$server_init_bundle"; then
    rm -f "$server_init_bundle"
    echo "server-init must not import astro: modules." >&2
    exit 1
  fi
  rm -f "$server_init_bundle"
  mapfile -t astro_files < <(in_dir web '\.astro$')
  if [ ${#astro_files[@]} -gt 0 ]; then
    step "astro compile"
    npx tsx scripts/compile-astro.ts "${astro_files[@]}"
  fi
  step "astro check"
  npx astro check
  step "unit tests"
  npm test
  cd "$root"
fi

if [ ${#prisma_files[@]} -gt 0 ] || [ ${#db_call_files[@]} -gt 0 ]; then
  step "schema drift"
  (cd web && npm run db-drift)

  test_url=${EXPERIENCE_TEST_DATABASE_URL:-$(read_env EXPERIENCE_TEST_DATABASE_URL)}
  if [ -z "$test_url" ]; then
    echo "EXPERIENCE_TEST_DATABASE_URL is not set (env or web/.env): cannot run the migration test." >&2
    exit 1
  fi
  step "migration test"
  (cd web && EXPERIENCE_TEST_DATABASE_URL="$test_url" npx tsx scripts/test-experience-migration.ts)
  # Trigger functions only fail when they run, so a schema change can break them as surely as an edit.
  step "trigger smoke test"
  (cd web && EXPERIENCE_TEST_DATABASE_URL="$test_url" npx tsx scripts/test-triggers.ts)
  step "database function calls through Prisma"
  (cd web && EXPERIENCE_TEST_DATABASE_URL="$test_url" npx tsx scripts/test-db-functions.ts)
  step "experience summary queries"
  (cd web && DATABASE_URL="$test_url" EXPERIENCE_QUERIES_TEST_DATABASE_URL="$test_url" node --import tsx --test src/lib/experienceQueries.test.ts)
fi

if [ ${#py_files[@]} -gt 0 ]; then
  cd pyworker
  step "ruff"
  if $staged_only; then
    .venv/bin/ruff check "${py_files[@]}"
    .venv/bin/ruff format --check "${py_files[@]}"
  else
    .venv/bin/ruff check .
    .venv/bin/ruff format --check .
  fi
  step "pytest"
  .venv/bin/python -m pytest -q
  cd "$root"
fi

step "all checks passed"
