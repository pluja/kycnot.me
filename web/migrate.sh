#!/bin/sh
set -e

# Apply migrations
echo "Applying database migrations..."
npx prisma migrate deploy

# Apply triggers
#
# Each trigger file is wrapped in a transaction with a short lock_timeout
# so that DDL conflicts with the live app fail fast (instead of deadlocking)
# and roll back atomically (instead of leaving partial state).
echo "Applying database triggers..."

apply_trigger() {
  trigger_file="$1"
  tmp_file=$(mktemp)
  {
    echo "BEGIN;"
    echo "SET LOCAL lock_timeout = '5s';"
    echo "SET LOCAL statement_timeout = '60s';"
    cat "$trigger_file"
    echo "COMMIT;"
  } > "$tmp_file"

  status=0
  npx prisma db execute --file "$tmp_file" --schema=./prisma/schema.prisma || status=$?
  rm -f "$tmp_file"
  return $status
}

for trigger_file in prisma/triggers/*.sql; do
  if [ ! -f "$trigger_file" ]; then
    echo "No trigger files found in prisma/triggers/ or $trigger_file is not a file."
    continue
  fi
  echo "Applying trigger: $trigger_file"

  attempt=1
  max_attempts=4
  while true; do
    if apply_trigger "$trigger_file"; then
      break
    fi
    if [ "$attempt" -ge "$max_attempts" ]; then
      echo "Trigger $trigger_file failed after $max_attempts attempts" >&2
      exit 1
    fi
    backoff=$((attempt * 5))
    echo "Trigger $trigger_file failed (attempt $attempt/$max_attempts), retrying in ${backoff}s..."
    sleep "$backoff"
    attempt=$((attempt + 1))
  done
done

echo "Migrations completed."
