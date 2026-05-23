set dotenv-load

astro_image := env_var_or_default("ASTRO_IMAGE", "codeberg.org/pluja/kycnot/astro")
pyworker_image := env_var_or_default("PYWORKER_IMAGE", "codeberg.org/pluja/kycnot/pyworker")

@default:
  just --list

# Build & roll out preprod from dev (image tag pre-<8-char-sha>). Mirrors deploy-preprod.yaml. Pass `nocache` to skip the docker layer cache.
deploy-pre flag="":
  #!/usr/bin/env bash
  set -euo pipefail
  if [ "{{flag}}" = "nocache" ]; then
    export NOCACHE=yes
  elif [ -n "{{flag}}" ]; then
    echo "Unknown flag: {{flag}} (expected: nocache)" >&2
    exit 1
  fi

  current=$(git symbolic-ref --short HEAD)
  if [ "$current" != "dev" ]; then
    echo "Preprod deploys must run from dev (currently on $current)." >&2
    exit 1
  fi

  short_sha=$(git rev-parse HEAD | cut -c1-8)
  image_tag="pre-${short_sha}"

  exec just _deploy pre staging SSH_PRE_TARGET APP_DIR_PRE no "$image_tag"

# Build & roll out prod from a v* git tag on master (image tag prod-<tag>). Mirrors deploy-production.yaml. Pass `nocache` to skip the docker layer cache.
deploy-prod flag="":
  #!/usr/bin/env bash
  set -euo pipefail
  if [ "{{flag}}" = "nocache" ]; then
    export NOCACHE=yes
  elif [ -n "{{flag}}" ]; then
    echo "Unknown flag: {{flag}} (expected: nocache)" >&2
    exit 1
  fi

  tag=$(git tag --points-at HEAD | grep '^v' | head -n1 || true)
  if [ -z "$tag" ]; then
    next="v$(date +%Y%m%d).1"
    echo "HEAD has no v* tag. Tag the release commit first, then re-run:" >&2
    echo "  git tag ${next}    # bump the trailing number for same-day releases" >&2
    echo "  git push origin ${next}" >&2
    exit 1
  fi

  git fetch --quiet origin master
  if ! git merge-base --is-ancestor "$tag" origin/master; then
    echo "Tag $tag does not point to a commit on master." >&2
    echo "Production tags must be on master. Run 'just promote-to-master' first." >&2
    exit 1
  fi

  image_tag="prod-${tag}"

  exec just _deploy prod production SSH_PROD_TARGET APP_DIR_PROD yes "$image_tag"

# Fast-forward master to dev and push. Run after a verified prod deploy.
promote-to-master:
  #!/usr/bin/env bash
  set -euo pipefail
  current=$(git symbolic-ref --short HEAD)
  if [ "$current" != "dev" ]; then
    echo "Must be on dev (currently on $current)." >&2
    exit 1
  fi
  if [ -n "$(git status --porcelain)" ]; then
    echo "Working tree has uncommitted changes." >&2
    exit 1
  fi
  git fetch origin
  git checkout master
  git merge --ff-only dev
  git push origin master
  git checkout dev

_deploy env mode ssh_var dir_var confirm image_tag:
  #!/usr/bin/env bash
  set -euo pipefail

  ensure_env() {
    local var="$1" prompt="$2" current="${!1:-}"
    if [ -n "$current" ]; then
      printf '%s' "$current"
      return
    fi
    exec 3>/dev/tty
    printf '%s: ' "$prompt" >&3
    read -r val </dev/tty
    exec 3>&-
    if [ -z "$val" ]; then
      echo "Empty value for $var, aborting." >&2
      exit 1
    fi
    if [ -f .env ] && grep -q "^${var}=" .env; then
      sed -i "s|^${var}=.*|${var}=${val}|" .env
    else
      echo "${var}=${val}" >> .env
    fi
    printf '%s' "$val"
  }

  ssh_target="$(ensure_env {{ssh_var}} 'SSH target for {{env}} (e.g. user@host or ssh alias)')"
  app_dir="$(ensure_env {{dir_var}} 'App directory on {{env}} server (e.g. /var/www/kycnot.me)')"

  if [ "{{confirm}}" = "yes" ]; then
    echo
    echo "============================================================"
    echo "  PRODUCTION DEPLOY"
    echo "  Tag:     {{image_tag}}"
    echo "  Target:  $ssh_target:$app_dir"
    echo "============================================================"
    printf "Type 'deploy {{image_tag}} to prod' to continue: "
    read -r ans
    if [ "$ans" != "deploy {{image_tag}} to prod" ]; then
      echo "Aborted."
      exit 1
    fi
  fi

  build_args=()
  if [ "${NOCACHE:-}" = "yes" ]; then
    echo "Building with --no-cache."
    build_args+=(--no-cache)
  fi

  echo "Building and pushing images..."
  docker build "${build_args[@]}" \
    -f web/Dockerfile \
    --build-arg ASTRO_BUILD_MODE={{mode}} \
    -t {{astro_image}}:{{image_tag}} \
    .
  docker build "${build_args[@]}" \
    -t {{pyworker_image}}:{{image_tag}} \
    ./pyworker
  docker push {{astro_image}}:{{image_tag}}
  docker push {{pyworker_image}}:{{image_tag}}

  echo
  echo "Syncing Makefile.prod to $ssh_target..."
  rsync -a Makefile.prod "$ssh_target:$app_dir/Makefile"

  echo
  echo "Rolling out on $ssh_target..."
  ssh "$ssh_target" "bash -s -- '$app_dir' '{{image_tag}}'" < scripts/deploy-remote.sh

  echo
  echo "Deployed {{image_tag}} to $ssh_target:$app_dir"

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
  cd web && npx prisma migrate status || echo "(Skipped migration status check; DATABASE_URL likely points at the docker network. Run inside a container or override DATABASE_URL=postgresql://kycnot:kycnot@localhost:3399/kycnot if you need this.)"

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
  