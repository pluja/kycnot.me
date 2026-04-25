#!/bin/sh
# Run server-init (Postgres LISTEN/NOTIFY) alongside the SSR server, forwarding
# signals to both children so the container exits promptly on `docker stop`.
set -eu

term_children() {
  kill -TERM "${INIT_PID:-}" "${ENTRY_PID:-}" 2>/dev/null || true
}

trap term_children TERM INT

node ./dist/server/server-init.js &
INIT_PID=$!

node ./dist/server/entry.mjs &
ENTRY_PID=$!

# Wait for the main server; if it exits, take down the listener too.
wait "$ENTRY_PID"
EXIT_CODE=$?

kill -TERM "$INIT_PID" 2>/dev/null || true
wait "$INIT_PID" 2>/dev/null || true

exit "$EXIT_CODE"
