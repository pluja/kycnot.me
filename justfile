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

# Create a database backup that includes the Prisma migrations table (recommended)
dump-db:
  #!/bin/bash
  mkdir -p backups
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  echo "Creating complete database backup (including _prisma_migrations table)..."
  docker compose exec -T database pg_dump -U ${POSTGRES_USER:-kycnot} -d ${POSTGRES_DATABASE:-kycnot} -c -F c > backups/db_backup_${TIMESTAMP}.dump
  echo "Backup saved to backups/db_backup_${TIMESTAMP}.dump"

# Create a database backup without the migrations table (legacy format)
dump-db-no-migrations:
  #!/bin/bash
  mkdir -p backups
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  echo "Creating database backup (excluding _prisma_migrations table)..."
  docker compose exec -T database pg_dump -U ${POSTGRES_USER:-kycnot} -d ${POSTGRES_DATABASE:-kycnot} -c -F c -T _prisma_migrations > backups/db_backup_no_migrations_${TIMESTAMP}.dump
  echo "Backup saved to backups/db_backup_no_migrations_${TIMESTAMP}.dump"

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
  
  echo "=== STEP 1: PREPARING DATABASE ==="
  # Drop all connections to the database
  docker compose exec -T database psql -U ${POSTGRES_USER:-kycnot} -c "SELECT pg_terminate_backend(pg_stat_activity.pid) FROM pg_stat_activity WHERE pg_stat_activity.datname = '${POSTGRES_DATABASE:-kycnot}' AND pid <> pg_backend_pid();" postgres
  
  # Drop and recreate database
  echo "Dropping and recreating the database..."
  docker compose exec -T database psql -U ${POSTGRES_USER:-kycnot} -c "DROP DATABASE IF EXISTS ${POSTGRES_DATABASE:-kycnot};" postgres
  docker compose exec -T database psql -U ${POSTGRES_USER:-kycnot} -c "CREATE DATABASE ${POSTGRES_DATABASE:-kycnot};" postgres
  
  echo "=== STEP 2: RESTORING PRODUCTION DATA ==="
  # Restore the database
  cat "$BACKUP_FILE" | docker compose exec -T database pg_restore -U ${POSTGRES_USER:-kycnot} -d ${POSTGRES_DATABASE:-kycnot} --no-owner
  echo "Database data restored successfully!"
  
  echo "=== STEP 3: CREATING PRISMA MIGRATIONS TABLE ==="
  # Create the _prisma_migrations table if it doesn't exist
  docker compose exec -T database psql -U ${POSTGRES_USER:-kycnot} -d ${POSTGRES_DATABASE:-kycnot} -c "
  CREATE TABLE IF NOT EXISTS _prisma_migrations (
    id VARCHAR(36) PRIMARY KEY NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    finished_at TIMESTAMP WITH TIME ZONE,
    migration_name VARCHAR(255) NOT NULL,
    logs TEXT,
    rolled_back_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    applied_steps_count INTEGER NOT NULL DEFAULT 0
  );"
  
  echo "=== STEP 4: REGISTERING MIGRATIONS ==="
  # Only register migrations if the table is empty
  migration_count=$(docker compose exec -T database psql -U ${POSTGRES_USER:-kycnot} -d ${POSTGRES_DATABASE:-kycnot} -t -c "SELECT COUNT(*) FROM _prisma_migrations;")
  if [ "$migration_count" -eq "0" ]; then
    # For each migration, insert a record into _prisma_migrations
    for migration_dir in $(find web/prisma/migrations -maxdepth 1 -mindepth 1 -type d | sort); do
      migration_name=$(basename "$migration_dir")
      sql_file="$migration_dir/migration.sql"
      
      if [ -f "$sql_file" ]; then
        echo "Registering migration: $migration_name"
        checksum=$(sha256sum "$sql_file" | cut -d' ' -f1)
        uuid=$(uuidgen)
        now=$(date -u +"%Y-%m-%d %H:%M:%S")
        
        docker compose exec -T database psql -U ${POSTGRES_USER:-kycnot} -d ${POSTGRES_DATABASE:-kycnot} -c "
        INSERT INTO _prisma_migrations (id, checksum, migration_name, logs, started_at, finished_at, applied_steps_count)
        VALUES ('$uuid', '$checksum', '$migration_name', 'Registered during import', '$now', '$now', 1)
        ON CONFLICT (migration_name) DO NOTHING;"
      fi
    done
  else
    echo "Migrations table already has entries. Skipping registration."
  fi

  echo "=== STEP 5: IMPORTING TRIGGERS ==="
  just import-triggers
  
  echo "Production database import completed successfully!"
  echo "Migration status:"
  cd web && npx prisma migrate status

# Scaffold a new blog post (markdown + image folder co-located in one directory)
new-blog:
  #!/bin/bash
  set -e

  BLOG_DIR="web/src/content/blog"

  if [ ! -d "$BLOG_DIR" ]; then
    echo "Error: $BLOG_DIR not found. Run from the repository root."
    exit 1
  fi

  echo "New blog post"
  echo ""

  while true; do
    read -p "Slug (kebab-case, e.g. 'stay-safe-using-services'): " SLUG
    if [ -z "$SLUG" ]; then
      echo "  Slug cannot be empty."
      continue
    fi
    if ! echo "$SLUG" | grep -qE '^[a-z0-9]+(-[a-z0-9]+)*$'; then
      echo "  Slug must be kebab-case: lowercase letters, digits, hyphens only."
      continue
    fi
    if [ -e "$BLOG_DIR/$SLUG" ]; then
      echo "  A post with slug '$SLUG' already exists at $BLOG_DIR/$SLUG"
      continue
    fi
    break
  done

  while true; do
    read -p "Title: " TITLE
    if [ -z "$TITLE" ]; then
      echo "  Title cannot be empty."
      continue
    fi
    if [ ${#TITLE} -gt 120 ]; then
      echo "  Title is ${#TITLE} chars, schema max is 120."
      continue
    fi
    break
  done

  while true; do
    read -p "Summary (used as meta description, max 300 chars): " SUMMARY
    if [ -z "$SUMMARY" ]; then
      echo "  Summary cannot be empty."
      continue
    fi
    if [ ${#SUMMARY} -gt 300 ]; then
      echo "  Summary is ${#SUMMARY} chars, schema max is 300."
      continue
    fi
    break
  done

  read -p "Author [pluja]: " AUTHOR
  AUTHOR=${AUTHOR:-pluja}

  read -p "Tags (comma-separated, optional, e.g. 'guide,monero'): " TAGS_INPUT

  read -p "Cover image filename (optional, any format: cover.avif, cover.webp, hero.png, etc.): " COVER

  read -p "Start as draft? [Y/n]: " IS_DRAFT
  IS_DRAFT=${IS_DRAFT:-Y}
  case "$IS_DRAFT" in
    [Yy]*) DRAFT_VALUE="true" ;;
    *) DRAFT_VALUE="false" ;;
  esac

  POST_DIR="$BLOG_DIR/$SLUG"
  POST_FILE="$POST_DIR/index.md"
  PUBLISHED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  mkdir -p "$POST_DIR"

  ESCAPED_TITLE=$(printf '%s' "$TITLE" | sed 's/\\/\\\\/g; s/"/\\"/g')
  ESCAPED_SUMMARY=$(printf '%s' "$SUMMARY" | sed 's/\\/\\\\/g; s/"/\\"/g')

  {
    echo "---"
    echo "title: \"$ESCAPED_TITLE\""
    echo "summary: \"$ESCAPED_SUMMARY\""
    echo "author: $AUTHOR"
    echo "publishedAt: $PUBLISHED_AT"
    if [ -n "$TAGS_INPUT" ]; then
      echo "tags:"
      echo "$TAGS_INPUT" | tr ',' '\n' | while read -r tag; do
        trimmed=$(echo "$tag" | sed 's/^ *//;s/ *$//')
        if [ -n "$trimmed" ]; then
          echo "  - $trimmed"
        fi
      done
    else
      echo "tags: []"
    fi
    if [ -n "$COVER" ]; then
      echo "coverImage: ./$COVER"
    fi
    echo "draft: $DRAFT_VALUE"
    echo "---"
    echo ""
    echo "## Introduction"
    echo ""
    echo "Brief intro to what the post covers and why the reader should care."
    echo ""
    echo "## Main content"
    echo ""
    echo "Write your content here. Markdown supported (GFM): tables, task lists,"
    echo "strikethrough, autolinks. Heading IDs are auto-generated, so you can link"
    echo "within the post like [jump to conclusion](#conclusion)."
    echo ""
    echo "Internal links use site-relative paths: [a service](/service/some-slug)"
    echo "or [another post](/blog/some-other-slug)."
    echo ""
    echo "Inline images live alongside this file in $POST_DIR/ and reference"
    echo "with relative paths so Astro optimizes them automatically:"
    echo "  ![Alt text describing the image](./screenshot.png)"
    echo ""
    echo "Always include meaningful alt text (it matters for SEO and accessibility)."
    echo ""
    echo "## Conclusion"
    echo ""
    echo "Wrap up. Summarize takeaways and link to related resources or services."
  } > "$POST_FILE"

  echo ""
  echo "Created:"
  echo "  $POST_FILE"
  echo "  $POST_DIR/  (drop cover and inline images alongside index.md)"
  echo ""
  echo "Next steps:"
  echo "  1. Add cover and inline images to $POST_DIR/ next to index.md"
  echo "  2. Edit $POST_FILE to write the content"
  echo "  3. Preview locally: cd web && npm run dev (then visit /blog)"
  echo "  4. Validate types: cd web && npx astro check"
  if [ "$DRAFT_VALUE" = "true" ]; then
    echo "  5. When ready: flip 'draft: false' in the frontmatter"
    echo "  6. Commit and push"
  else
    echo "  5. Commit and push"
  fi

  if [ -n "${EDITOR:-}" ]; then
    echo ""
    read -p "Open in \$EDITOR ($EDITOR) now? [Y/n]: " OPEN
    OPEN=${OPEN:-Y}
    case "$OPEN" in
      [Yy]*) eval "$EDITOR \"$POST_FILE\"" ;;
    esac
  fi
  