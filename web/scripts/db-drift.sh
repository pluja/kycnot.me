#!/bin/sh
# Fails when a migration and the schema disagree.
#
# That disagreement is otherwise invisible: the database has the column, the
# generated client does not, and every write of the field throws at runtime
# while the tests stay green.
#
# Replaying the migrations needs a database of its own, which Prisma empties and
# rebuilds. Naming the wrong one here destroys it, so the two are compared
# before Prisma is handed either: same host, same port, same database is
# refused, whatever the schema says. Give the shadow a role that cannot reach
# the primary at all and this cannot be got wrong from a typo.
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set" >&2
  exit 1
fi
if [ -z "${SHADOW_DATABASE_URL:-}" ]; then
  echo "SHADOW_DATABASE_URL is not set. It must name a throwaway database," >&2
  echo "never the one holding your data: replaying the migrations empties it." >&2
  exit 1
fi

# Host, port and database name, with the query string and credentials left off,
# so a shadow that differs only by ?schema= is still recognised as the same
# database. That mistake looks like a separate database and is not one.
identity() {
  printf '%s' "$1" | sed -e 's/?.*$//' -e 's#^[^:]*://##' -e 's/^[^@]*@//'
}

if [ "$(identity "$DATABASE_URL")" = "$(identity "$SHADOW_DATABASE_URL")" ]; then
  echo "SHADOW_DATABASE_URL points at the same database as DATABASE_URL." >&2
  echo "Replaying the migrations there would empty it. Give the shadow its own" >&2
  echo "database, not just its own schema." >&2
  exit 1
fi

exec npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "$SHADOW_DATABASE_URL" \
  --exit-code
