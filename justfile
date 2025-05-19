set dotenv-load	

@default: 
  just --list

# Start the development database and redis services
dev-database:
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up database redis db-admin

# Import all triggers to the database
import-triggers:
  #!/bin/bash
  for sql_file in web/prisma/triggers/*.sql; do
    echo "Importing $sql_file..."
    docker compose exec -T database psql -U ${DATABASE_USER:-kycnot} -d ${DATABASE_NAME:-kycnot} < "$sql_file"
  done

dump-db:
  #!/bin/bash
  mkdir -p backups
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  echo "Creating database backup (excluding _prisma_migrations table)..."
  docker compose exec -T database pg_dump -U ${POSTGRES_USER:-kycnot} -d ${POSTGRES_DATABASE:-kycnot} -c -F c -T _prisma_migrations > backups/db_backup_${TIMESTAMP}.dump
  echo "Backup saved to backups/db_backup_${TIMESTAMP}.dump"

# Import a database backup. Usage: just import-db [filename]
# If no filename is provided, it will use the most recent backup
import-db file="":
  #!/bin/bash
  if [ -z "{{file}}" ]; then
    BACKUP_FILE=$(find backups/ -name 'db_backup_*.dump' | sort -r | head -n 1)
    if [ -z "$BACKUP_FILE" ]; then
      echo "Error: No backup files found in the backups directory"
      exit 1
    fi
  else
    BACKUP_FILE="{{file}}"
    if [ ! -f "$BACKUP_FILE" ]; then
      echo "Error: Backup file '$BACKUP_FILE' not found"
      exit 1
    fi
  fi
  
  echo "Restoring database from $BACKUP_FILE..."
  # First drop all connections to the database
  docker compose exec -T database psql -U ${POSTGRES_USER:-kycnot} -c "SELECT pg_terminate_backend(pg_stat_activity.pid) FROM pg_stat_activity WHERE pg_stat_activity.datname = '${POSTGRES_DATABASE:-kycnot}' AND pid <> pg_backend_pid();" postgres
  # Then restore the database
  cat "$BACKUP_FILE" | docker compose exec -T database pg_restore -U ${POSTGRES_USER:-kycnot} -d ${POSTGRES_DATABASE:-kycnot} --clean --if-exists
  echo "Database restored successfully!"
  