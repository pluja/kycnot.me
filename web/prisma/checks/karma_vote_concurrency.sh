#!/bin/sh
# The per-pair karma cap under votes cast at the same moment.
#
# The checks in karma_vote_guards.sql run in one session, so they can only prove
# the cap holds against a voter who waits for each vote to finish. The cap is
# decided by counting votes already paid, and concurrent transactions all read
# that count before any of them has written, so without serialisation every one
# of them is paid.
#
#   web/prisma/checks/karma_vote_concurrency.sh
#
# Unlike the guards this cannot roll back, because the point is what happens
# when the transactions commit. It makes its own author, voter and comments,
# votes from several connections at once, and removes all of it on the way out,
# whether it passed, failed or was interrupted. Nothing it touches existed
# before it ran.
set -eu

VOTES=${VOTES:-6}
CAP=3
PSQL="docker compose exec -T -e PGOPTIONS=-cclient_min_messages=warning database psql -U kycnot -d kycnot -tAqX -v ON_ERROR_STOP=1"
TAG="karma-concurrency-check"

cd "$(dirname "$0")/../../.."

cleanup() {
  $PSQL -c "
    DELETE FROM \"KarmaTransaction\" WHERE \"userId\" IN
      (SELECT id FROM \"User\" WHERE name LIKE '$TAG%');
    DELETE FROM \"Comment\" WHERE \"authorId\" IN
      (SELECT id FROM \"User\" WHERE name LIKE '$TAG%');
    DELETE FROM \"User\" WHERE name LIKE '$TAG%';
  " > /dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM
cleanup

SERVICE=$($PSQL -c "SELECT id FROM \"Service\" ORDER BY id LIMIT 1")
if [ -z "$SERVICE" ]; then
  echo "FAIL: no service to hang the fixture comments off"
  exit 1
fi

# The author must be neither admin nor moderator, or votes on their comments are
# not paid at all and the check would pass without exercising the cap.
IFS='|' read -r AUTHOR VOTER COMMENTS <<EOF
$($PSQL -c "
  WITH author AS (
    INSERT INTO \"User\" (name, \"displayName\", \"secretTokenHash\", \"feedId\", admin, capabilities)
    VALUES ('$TAG-author', '$TAG author', '$TAG-author', '$TAG-author', false, ARRAY[]::text[]) RETURNING id
  ), voter AS (
    INSERT INTO \"User\" (name, \"displayName\", \"secretTokenHash\", \"feedId\", admin, capabilities)
    VALUES ('$TAG-voter', '$TAG voter', '$TAG-voter', '$TAG-voter', false, ARRAY[]::text[]) RETURNING id
  ), comments AS (
    INSERT INTO \"Comment\" (content, \"authorId\", \"serviceId\", status)
    SELECT 'fixture', author.id, $SERVICE, 'APPROVED'
    FROM author, generate_series(1, $VOTES) RETURNING id
  )
  SELECT author.id, voter.id, string_agg(comments.id::text, ',' ORDER BY comments.id)
  FROM author, voter, comments GROUP BY author.id, voter.id
")
EOF

if [ -z "${AUTHOR:-}" ] || [ -z "${VOTER:-}" ] || [ -z "${COMMENTS:-}" ]; then
  echo "FAIL: could not create the fixtures"
  exit 1
fi

BEFORE=$($PSQL -c "SELECT \"totalKarma\" FROM \"User\" WHERE id = $AUTHOR")

# A starting gate rather than a sleep in each session, which only overlaps them
# if every one of them starts on time. One session holds the barrier
# exclusively; the voters queue behind it for it in shared mode, which they can
# all hold at once, so they are released together when the holder disconnects.
BARRIER=$($PSQL -c "SELECT (random() * 1000000)::int")
$PSQL -c "SELECT pg_advisory_lock($BARRIER); SELECT pg_sleep(2);" > /dev/null 2>&1 &
barrier_pid=$!
sleep 0.3

pids=""
for comment in $(echo "$COMMENTS" | tr ',' ' '); do
  $PSQL -c "
    SELECT pg_advisory_lock_shared($BARRIER);
    BEGIN;
    INSERT INTO \"CommentVote\" (\"commentId\", \"userId\", downvote) VALUES ($comment, $VOTER, false);
    COMMIT;
  " > /dev/null 2>&1 &
  pids="$pids $!"
done

wait "$barrier_pid" || true

cast=0
failed=0
for pid in $pids; do
  if wait "$pid"; then cast=$((cast + 1)); else failed=$((failed + 1)); fi
done

PAID=$($PSQL -c "
  SELECT count(*) FROM \"CommentVote\" v JOIN \"Comment\" c ON c.id = v.\"commentId\"
  WHERE v.\"userId\" = $VOTER AND c.\"authorId\" = $AUTHOR AND v.\"karmaApplied\" <> 0
")
GAINED=$(($($PSQL -c "SELECT \"totalKarma\" FROM \"User\" WHERE id = $AUTHOR") - BEFORE))

$PSQL -c "DELETE FROM \"CommentVote\" WHERE \"userId\" = $VOTER" > /dev/null
RETURNED=$(($($PSQL -c "SELECT \"totalKarma\" FROM \"User\" WHERE id = $AUTHOR") - BEFORE))

expected_paid=$((VOTES < CAP ? VOTES : CAP))
status=0
fail() { echo "FAIL: $1"; status=1; }

[ "$failed" -eq 0 ] || fail "$failed of $VOTES votes never landed, so nothing was proved"
[ "$cast" -eq "$VOTES" ] || fail "only $cast of $VOTES votes were cast"
[ "$PAID" -eq "$expected_paid" ] || fail "$VOTES votes at once paid $PAID, expected $expected_paid"
[ "$GAINED" -eq "$expected_paid" ] || fail "karma moved by $GAINED, expected $expected_paid"
[ "$RETURNED" -eq 0 ] || fail "removing the votes left $RETURNED karma behind"

[ "$status" = 0 ] && echo "ok: $VOTES votes at once paid $PAID, moved $GAINED karma, and gave it all back"
exit $status
