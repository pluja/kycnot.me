#!/usr/bin/env bash
# Checks every commit in BASE..HEAD before it can reach preprod or a release.
# Fails on: an author or committer email outside ALLOWED_AUTHOR_EMAILS, any of
# FORBIDDEN_STRINGS in a message or added line, a migration that drops a table
# or column without "destructive migration" in its commit message, and any
# secret gitleaks finds. Both lists are space separated.
set -euo pipefail

base="${1:?usage: check-commits.sh <base> <head>}"
head="${2:?usage: check-commits.sh <base> <head>}"
allowed="${ALLOWED_AUTHOR_EMAILS:-}"
forbidden="${FORBIDDEN_STRINGS:-}"
failed=0

fail() {
  echo "FAIL: $*" >&2
  failed=1
}

if ! git merge-base --is-ancestor "$base" "$head"; then
  echo "FAIL: $base is not an ancestor of $head" >&2
  exit 1
fi

commits=$(git rev-list --reverse "$base..$head")
if [ -z "$commits" ]; then
  echo "No new commits between $base and $head."
  exit 0
fi
echo "Checking $(echo "$commits" | wc -l) commits."

if [ -z "$allowed" ]; then
  fail "ALLOWED_AUTHOR_EMAILS is empty. Set the repository variable."
fi

for commit in $commits; do
  short=$(git rev-parse --short "$commit")
  subject=$(git log -1 --format=%s "$commit")

  for email in $(git log -1 --format='%ae%n%ce' "$commit" | sort -u); do
    case " $allowed " in
      *" $email "*) ;;
      *) fail "$short uses identity $email, not in the allowlist: $subject" ;;
    esac
  done

  message=$(git log -1 --format=%B "$commit")
  for word in $forbidden; do
    if printf '%s' "$message" | grep -qiF -- "$word"; then
      fail "$short mentions '$word' in its message"
    fi
    if git show --format= --unified=0 "$commit" | grep '^+' | grep -qiF -- "$word"; then
      fail "$short adds a line containing '$word'"
    fi
  done

  destructive=$(git show --format= --name-only --diff-filter=A "$commit" \
    | { grep -E '^web/prisma/migrations/.*\.sql$' || true; } \
    | while IFS= read -r file; do
        if git show "$commit:$file" | grep -qiE 'DROP (TABLE|COLUMN)|ALTER TABLE .* DROP '; then
          echo "$file"
        fi
      done || true)
  if [ -n "$destructive" ] && ! printf '%s' "$message" | grep -qi 'destructive migration'; then
    fail "$short drops a table or column in $destructive. Say 'destructive migration' in the message if that is intended"
  fi
done

if command -v gitleaks >/dev/null 2>&1; then
  if ! gitleaks git --no-banner --redact --log-opts="$base..$head" .; then
    fail "gitleaks found a secret"
  fi
else
  fail "gitleaks is not installed on this runner"
fi

if [ "$failed" -ne 0 ]; then
  exit 1
fi
echo "All commits pass."
