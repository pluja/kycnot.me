"""End-to-end integration test: run real moderation against specific comments.

Unlike dry_run_moderation.py, this calls apply_ai_moderation_decision and
mutates the database. Captures before/after row state + downstream trigger
effects (karma, rating weight, notifications, service score).

Usage:
    uv run python wet_run_moderation.py <comment_id> [<comment_id> ...]
"""

import json
import sys
from typing import Any, Dict, List, Optional

from pyworker.database import (
    apply_ai_moderation_decision,
    get_db_connection,
    get_moderation_context,
)
from pyworker.tasks.comment_moderation import _DateTimeEncoder, _decide
from pyworker.utils.ai import prompt_comment_moderation

SNAPSHOT_FIELDS = [
    'id', 'status', 'ratingWeight', 'ratingTrustLabel', 'ratingTrustReason',
    'ratingMuted', 'ratingMuteReason', 'aiAction', 'aiQuality', 'aiIsSpam',
    'aiIsBrigade', 'aiBrigadeConfidence', 'aiReasoning', 'aiDecidedAt',
    'adminNote', 'publicNote',
]


def snapshot_comment(cursor, comment_id: int) -> Optional[Dict[str, Any]]:
    fields_sql = ', '.join(f'"{f}"' for f in SNAPSHOT_FIELDS)
    cursor.execute(f'SELECT {fields_sql}, "authorId", "serviceId" FROM "Comment" WHERE id = %s', (comment_id,))
    row = cursor.fetchone()
    if not row:
        return None
    cols = SNAPSHOT_FIELDS + ['authorId', 'serviceId']
    return dict(zip(cols, row))


def snapshot_author(cursor, author_id: int) -> Dict[str, Any]:
    cursor.execute('SELECT id, name, "totalKarma" FROM "User" WHERE id = %s', (author_id,))
    row = cursor.fetchone()
    return {'id': row[0], 'name': row[1], 'totalKarma': row[2]} if row else {}


def count_karma_transactions(cursor, comment_id: int) -> int:
    cursor.execute('SELECT COUNT(*) FROM "KarmaTransaction" WHERE "commentId" = %s', (comment_id,))
    return cursor.fetchone()[0]


def count_notifications(cursor, comment_id: int) -> int:
    cursor.execute('SELECT COUNT(*) FROM "Notification" WHERE "aboutCommentId" = %s', (comment_id,))
    return cursor.fetchone()[0]


def snapshot_service_rating(cursor, service_id: int) -> Dict[str, Any]:
    cursor.execute(
        'SELECT "averageUserRating", "trustWeightedUserRating", "userRatingCount", '
        '"trustedUserRatingCount", "userRatingWeight" FROM "Service" WHERE id = %s',
        (service_id,),
    )
    row = cursor.fetchone()
    return {
        'averageUserRating': row[0],
        'trustWeightedUserRating': row[1],
        'userRatingCount': row[2],
        'trustedUserRatingCount': row[3],
        'userRatingWeight': row[4],
    } if row else {}


def diff_lines(label: str, before: Dict[str, Any], after: Dict[str, Any]) -> List[str]:
    lines = []
    for key in before:
        b, a = before[key], after.get(key)
        if b != a:
            lines.append(f'    {label}.{key}: {b!r} -> {a!r}')
    return lines


def run(comment_ids: List[int]) -> None:
    with get_db_connection() as conn:
        for cid in comment_ids:
            print('=' * 76)
            print(f'Comment {cid}')
            print('-' * 76)

            with conn.cursor() as cur:
                before_row = snapshot_comment(cur, cid)
                if not before_row:
                    print('  not found')
                    continue
                before_author = snapshot_author(cur, before_row['authorId'])
                before_service = snapshot_service_rating(cur, before_row['serviceId'])
                before_karma_tx = count_karma_transactions(cur, cid)
                before_notifs = count_notifications(cur, cid)

            print(f'  before status={before_row["status"]} ratingWeight={before_row["ratingWeight"]:.2f} '
                  f'ratingMuted={before_row["ratingMuted"]} aiAction={before_row["aiAction"]} '
                  f'authorKarma={before_author["totalKarma"]}')

            ctx = get_moderation_context(cid)
            if ctx is None:
                print('  no context'); continue

            try:
                ai = prompt_comment_moderation(json.dumps(ctx, cls=_DateTimeEncoder))
            except Exception as e:
                print(f'  AI ERROR: {e}'); continue

            decision = _decide(ai, ctx)
            ok = apply_ai_moderation_decision(
                comment_id=cid,
                status=decision['status'],
                ai_action=decision['ai_action'],
                ai_quality=int(ai['commentQuality']),
                ai_is_spam=bool(ai['isSpam']),
                ai_is_brigade=bool(ai['isBrigade']),
                ai_brigade_confidence=int(ai['brigadeConfidence']),
                ai_signals=decision['ai_signals'],
                ai_reasoning=(ai.get('reasoning') or '').strip(),
                rating_muted=decision['rating_muted'],
                rating_mute_reason=decision['rating_mute_reason'],
                admin_note=decision['admin_note'],
                public_note=decision['public_note'],
            )
            if not ok:
                print('  WRITE FAILED'); continue

            with conn.cursor() as cur:
                after_row = snapshot_comment(cur, cid)
                after_author = snapshot_author(cur, before_row['authorId'])
                after_service = snapshot_service_rating(cur, before_row['serviceId'])
                after_karma_tx = count_karma_transactions(cur, cid)
                after_notifs = count_notifications(cur, cid)

            print(f'  after  status={after_row["status"]} ratingWeight={after_row["ratingWeight"]:.2f} '
                  f'ratingMuted={after_row["ratingMuted"]} aiAction={after_row["aiAction"]} '
                  f'authorKarma={after_author["totalKarma"]}')

            comment_diffs = diff_lines('comment', before_row, after_row)
            author_diffs = diff_lines('author', before_author, after_author)
            service_diffs = diff_lines('service', before_service, after_service)

            print(f'  AI: {ai["recommendedAction"]} '
                  f'spam={ai["isSpam"]} brigade={ai["brigadeConfidence"]}/5 q={ai["commentQuality"]}')

            if comment_diffs:
                print('  changes:')
                for line in comment_diffs:
                    print(line)
            if author_diffs:
                print('  author changes:')
                for line in author_diffs:
                    print(line)
            if service_diffs:
                print('  service score changes:')
                for line in service_diffs:
                    print(line)
            print(f'  karma transactions: {before_karma_tx} -> {after_karma_tx}')
            print(f'  notifications: {before_notifs} -> {after_notifs}')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('usage: uv run python wet_run_moderation.py <comment_id> [<comment_id> ...]')
        sys.exit(1)
    run([int(x) for x in sys.argv[1:]])
