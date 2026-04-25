#!/usr/bin/env bash
# Runs on the deployment server. Streamed in over ssh by `just deploy-{pre,prod}`.
# Args: $1 = app_dir, $2 = new image tag (e.g. pre-abc1234).
set -euo pipefail

APP_DIR="$1"
NEW_TAG="$2"

cd "$APP_DIR"

set -a
[ -f .env ] && . ./.env
set +a

run_hooks() {
  local stage="$1"
  local dir=".platform/hooks/$stage"
  [ -d "$dir" ] || return 0
  for hook in "$dir"/*; do
    if [ -f "$hook" ] && [ -x "$hook" ]; then
      echo ">> $stage hook: $(basename "$hook")"
      bash "$hook" </dev/null
    fi
  done
}

echo "==> Predeploy hooks"
run_hooks predeploy

echo "==> Backing up database"
mkdir -p backups
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="backups/predeploy_${NEW_TAG}_${TIMESTAMP}.dump"
docker compose exec -T database pg_dump \
  -U "${POSTGRES_USER:-kycnot}" \
  -d "${POSTGRES_DATABASE:-kycnot}" \
  -c -F c </dev/null > "$BACKUP_FILE"
echo "    saved $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

echo "==> Updating image tags in .env to $NEW_TAG"
for var in ASTRO_IMAGE_TAG PYWORKER_IMAGE_TAG; do
  if grep -q "^${var}=" .env; then
    sed -i "s|^${var}=.*|${var}=${NEW_TAG}|" .env
  else
    echo "${var}=${NEW_TAG}" >> .env
  fi
done

echo "==> Pulling images"
docker compose pull astro pyworker

echo "==> Running migrations"
docker compose run --rm -T astro knm-migrate </dev/null

echo "==> Rolling out astro"
docker rollout astro
echo "==> Rolling out pyworker"
docker rollout pyworker

echo "==> Postdeploy hooks"
run_hooks postdeploy
