#!/bin/sh
set -e

# Apply migrations
echo "Applying database migrations..."
npx prisma migrate deploy

# Apply triggers
echo "Applying database triggers..."
for trigger_file in prisma/triggers/*.sql; do
  if [ -f "$trigger_file" ]; then
    echo "Applying trigger: $trigger_file"
    npx prisma db execute --file "$trigger_file" --schema=./prisma/schema.prisma
  else
    echo "No trigger files found in prisma/triggers/ or $trigger_file is not a file."
  fi
done

# Start the application
echo "Starting the application..."
exec "$@"
