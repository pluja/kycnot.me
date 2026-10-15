"""Dry-run the new moderation flow against existing comments without touching the DB.

Usage:
    uv run python dry_run_moderation.py <comment_id> [<comment_id> ...]
"""

import json
import sys
from typing import Any, Dict, List

from pyworker.database import get_moderation_context
from pyworker.tasks.comment_moderation import _DateTimeEncoder, _decide
from pyworker.utils.ai import prompt_comment_moderation


def _summarize_context(ctx: Dict[str, Any]) -> str:
    c = ctx["comment"]
    a = c["author"]
    cl = ctx["context"]["clusterSignals"]
    ev = ctx["context"]["recentEvents"]
    return (
        f"  author age={a['accountAgeMinutes']}min untrusted={(a.get('trust') or {}).get('isUntrusted')} "
        f"verified={a['isVerified']} affiliated={a['isServiceAffiliated']} "
        f"priorOnService={a['priorApprovedCommentsOnThisService']}\n"
        f"  cluster fresh={cl['freshAccountsLast72h']} "
        f"simMax={cl['similarityMax']} userSpike={cl['newUserCreationSpikeNearAuthor']}\n"
        f"  events={len(ev)} "
        f"submission kind={c['submission']['kind']} hasProof={c['submission']['hasPrivateProof']}"
    )


def run(comment_ids: List[int]) -> None:
    for comment_id in comment_ids:
        print("=" * 72)
        print(f"Comment {comment_id}")
        print("-" * 72)

        ctx = get_moderation_context(comment_id)
        if ctx is None:
            print("  no context (comment not found)")
            continue

        print(f"  content: {ctx['comment']['content'][:160]!r}")
        print(_summarize_context(ctx))

        try:
            ai = prompt_comment_moderation(json.dumps(ctx, cls=_DateTimeEncoder))
        except Exception as e:
            print(f"  AI ERROR: {e}")
            continue

        print(
            f"  AI: {ai['recommendedAction']} "
            f"spam={ai['isSpam']} "
            f"brigade={ai['brigadeConfidence']}/5 "
            f"quality={ai['commentQuality']} "
            f"rejectionRule={ai.get('rejectionRule')}"
        )
        print(f"  reasoning: {ai['reasoning']}")

        decision = _decide(ai, ctx)
        print(
            f"  DECISION: status={decision['status']} "
            f"aiAction={decision['ai_action']} "
            f"rejectionRule={decision['rejection_rule']} "
            f"hardGate=({decision['hard_gate_reason'] or 'none'})"
        )


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(
            "usage: uv run python dry_run_moderation.py <comment_id> [<comment_id> ...]"
        )
        sys.exit(1)
    run([int(x) for x in sys.argv[1:]])
