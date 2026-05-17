"""
Automated moderation for pending comments.

Per pending comment, fetch the structured moderation context via the
get_comment_moderation_context SQL function, ask the LLM for a decision,
then apply server-side hard gates before writing back to the database.

Hard gates always force human review regardless of the LLM's recommendation:
- the comment has an orderId (private proof needs human verification)
- the service has strictCommentingEnabled
- the user flagged a KYC issue or funds-blocked claim
- the LLM detected a brigade with confidence >= 4 (rating is auto-neutralized
  via the suspicious flag, but visibility still needs a human)
"""

import json
from datetime import datetime
from typing import Any, Dict, List, Mapping

from pyworker.database import (  # type: ignore
    apply_moderation_decision,
    get_moderation_context,
    get_pending_comments,
)
from pyworker.tasks.base import Task  # type: ignore
from pyworker.utils.ai import prompt_comment_moderation

_BRIGADE_HARD_GATE_CONFIDENCE = 4


class _DateTimeEncoder(json.JSONEncoder):
    def default(self, o: Any) -> Any:
        if isinstance(o, datetime):
            return o.isoformat()
        return super().default(o)


def _build_internal_note(ai_result: Mapping[str, Any], hard_gate_reason: str) -> str:
    """Compact audit line plus the AI's reasoning. Until the schema cleanup
    adds dedicated AI columns, this is the only place the signals are recorded."""
    header = (
        f"AI: {ai_result['recommendedAction']} "
        f"(quality={ai_result['commentQuality']}, "
        f"spam={ai_result['isSpam']}, "
        f"brigade={ai_result['brigadeConfidence']}/5, "
        f"ratingDisable={ai_result['ratingShouldBeDisabled']})"
    )
    if hard_gate_reason:
        header += f" | hardGate: {hard_gate_reason}"
    reasoning = (ai_result.get("reasoning") or "").strip()
    return f"{header}\n{reasoning}" if reasoning else header


def _decide(ai_result: Mapping[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Combine the AI recommendation with server-side hard gates.

    Returns a dict with: status, requires_admin_review, suspicious,
    rating_disabled_by_moderator, internal_note, community_note, hard_gate_reason.
    """
    submission = context["comment"]["submission"]
    service = context["service"]

    is_high_conf_brigade = (
        ai_result["isBrigade"]
        and ai_result["brigadeConfidence"] >= _BRIGADE_HARD_GATE_CONFIDENCE
    )

    hard_gate_reasons: List[str] = []
    if submission["hasOrderId"]:
        hard_gate_reasons.append("orderId present")
    if service["strictCommentingEnabled"]:
        hard_gate_reasons.append("strict commenting")
    if submission["kycIssueClaimed"]:
        hard_gate_reasons.append("kyc issue claimed")
    if submission["fundsBlockedClaimed"]:
        hard_gate_reasons.append("funds blocked claimed")
    if is_high_conf_brigade:
        hard_gate_reasons.append(
            f"brigade confidence {ai_result['brigadeConfidence']}/5"
        )

    hard_gate_reason = ", ".join(hard_gate_reasons)

    if hard_gate_reasons:
        status = "PENDING"
        requires_admin_review = True
    elif ai_result["recommendedAction"] == "approve":
        status = "APPROVED"
        requires_admin_review = False
    elif ai_result["recommendedAction"] == "reject":
        status = "REJECTED"
        requires_admin_review = False
    else:
        status = "PENDING"
        requires_admin_review = True

    community_note = ai_result.get("contextNote") or None
    if community_note is not None and not community_note.strip():
        community_note = None

    return {
        "status": status,
        "requires_admin_review": requires_admin_review,
        "suspicious": is_high_conf_brigade,
        "rating_disabled_by_moderator": ai_result["ratingShouldBeDisabled"],
        "internal_note": _build_internal_note(ai_result, hard_gate_reason),
        "community_note": community_note,
        "hard_gate_reason": hard_gate_reason,
    }


class CommentModerationTask(Task):
    """Decides on pending comments for a single service."""

    def __init__(self):
        super().__init__("comment_moderation")

    def run(self, service: Dict[str, Any]) -> bool:
        service_id = service["id"]
        service_name = service["name"]

        comments = get_pending_comments(service_id)

        if not comments:
            self.logger.info(
                f"No pending comments for service {service_name} (ID: {service_id})."
            )
            return False

        self.logger.info(
            f"Moderating {len(comments)} pending comment(s) for {service_name} "
            f"(ID: {service_id})."
        )

        processed_at_least_one = False
        for comment_row in comments:
            comment_id = comment_row["id"]

            context = get_moderation_context(comment_id)
            if context is None:
                self.logger.warning(
                    f"Missing moderation context for comment {comment_id}; skipping."
                )
                continue

            try:
                ai_result = prompt_comment_moderation(
                    json.dumps(context, cls=_DateTimeEncoder)
                )
            except Exception as e:
                self.logger.error(
                    f"AI call failed for comment {comment_id}: {e}; leaving pending."
                )
                continue

            decision = _decide(ai_result, context)

            ok = apply_moderation_decision(
                comment_id=comment_id,
                status=decision["status"],
                requires_admin_review=decision["requires_admin_review"],
                suspicious=decision["suspicious"],
                rating_disabled_by_moderator=decision["rating_disabled_by_moderator"],
                internal_note=decision["internal_note"],
                community_note=decision["community_note"],
            )

            if ok:
                self.logger.info(
                    f"Comment {comment_id}: status={decision['status']} "
                    f"action={ai_result['recommendedAction']} "
                    f"brigade={ai_result['brigadeConfidence']}/5 "
                    f"quality={ai_result['commentQuality']} "
                    f"hardGate=({decision['hard_gate_reason'] or 'none'})"
                )
                processed_at_least_one = True

        return processed_at_least_one
