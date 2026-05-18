"""
Automated moderation for pending comments.

For each pending comment, fetch the structured moderation context via the
get_comment_moderation_context SQL function, ask the LLM for a decision, then
apply server-side hard gates before writing the verdict.

Hard gates block auto-APPROVE but let REJECT pass through. Trash content
shouldn't sit in a queue just because it can't be auto-approved.
- the comment has a private proof (needs human verification)
- the service has strictCommentingEnabled AND this is a root review
  (replies don't need proof; strict-commenting only governs new reviews)
- the user flagged KYC_REQUESTED or FUNDS_BLOCKED
- the AI detected a brigade with confidence >= 4 (rating gets auto-muted)

Outcomes map to columns:
- recommendedAction -> aiAction (APPROVE / REJECT / HOLD)
- aiAction -> status (APPROVED / REJECTED / PENDING) unless overridden by hard gate
- isBrigade && confidence >= 4 -> ratingMuted=true + ratingMuteReason=SUSPICIOUS_PATTERN
- ratingShouldBeDisabled (affiliated puff, etc.) -> ratingMuted=true with reason
"""

import json
from datetime import datetime
from typing import Any, Dict, List, Mapping, Optional

from pyworker.database import (  # type: ignore
    apply_ai_moderation_decision,
    get_moderation_context,
    get_pending_comments,
)
from pyworker.tasks.base import Task  # type: ignore
from pyworker.utils.ai import prompt_comment_moderation

_BRIGADE_HARD_GATE_CONFIDENCE = 4

_ACTION_TO_STATUS = {
    "approve": "APPROVED",
    "reject": "REJECTED",
    "human_review": "PENDING",
}

_ACTION_TO_ENUM = {
    "approve": "APPROVE",
    "reject": "REJECT",
    "human_review": "HOLD",
}


class _DateTimeEncoder(json.JSONEncoder):
    def default(self, o: Any) -> Any:
        if isinstance(o, datetime):
            return o.isoformat()
        return super().default(o)


def _build_admin_note(ai_result: Mapping[str, Any], hard_gate_reason: str) -> str:
    """Compact audit line plus the AI's reasoning."""
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


def _pick_mute_reason(
    ai_result: Mapping[str, Any],
    context: Mapping[str, Any],
    is_brigade_hard_gate: bool,
) -> Optional[str]:
    if is_brigade_hard_gate:
        return "SUSPICIOUS_PATTERN"
    if not ai_result.get("ratingShouldBeDisabled"):
        return None
    author = context["comment"]["author"]
    if author.get("isServiceAffiliated"):
        return "AUTHOR_AFFILIATED"
    karma = author.get("totalKarma")
    if karma is not None and karma < 0:
        return "AUTHOR_LOW_TRUST"
    if int(ai_result.get("brigadeConfidence", 0)) >= 2:
        return "SUSPICIOUS_PATTERN"
    return "CONFLICT_OF_INTEREST"


def _decide(ai_result: Mapping[str, Any], context: Mapping[str, Any]) -> Dict[str, Any]:
    """Combine the AI recommendation with server-side hard gates."""
    submission = context["comment"]["submission"]
    service = context["service"]

    is_high_conf_brigade = (
        bool(ai_result["isBrigade"])
        and int(ai_result["brigadeConfidence"]) >= _BRIGADE_HARD_GATE_CONFIDENCE
    )

    is_root_review = bool(submission.get("isRootReview"))

    hard_gate_reasons: List[str] = []
    if submission.get("hasPrivateProof"):
        hard_gate_reasons.append("private proof present")
    if service.get("strictCommentingEnabled") and is_root_review:
        hard_gate_reasons.append("strict commenting")
    if submission.get("kycIssueClaimed"):
        hard_gate_reasons.append("kyc issue claimed")
    if submission.get("fundsBlockedClaimed"):
        hard_gate_reasons.append("funds blocked claimed")
    if is_high_conf_brigade:
        hard_gate_reasons.append(
            f"brigade confidence {ai_result['brigadeConfidence']}/5"
        )

    hard_gate_reason = ", ".join(hard_gate_reasons)
    recommended_action = ai_result["recommendedAction"]

    # Hard gates only block auto-APPROVE. REJECT and HOLD pass through so
    # obvious trash gets removed and explicit human-review requests don't
    # get masked behind a generic "hard gate" hold.
    if hard_gate_reasons and recommended_action == "approve":
        status = "PENDING"
        ai_action_enum = "HOLD"
    else:
        status = _ACTION_TO_STATUS[recommended_action]
        ai_action_enum = _ACTION_TO_ENUM[recommended_action]

    rating_muted = (
        is_high_conf_brigade or bool(ai_result.get("ratingShouldBeDisabled"))
    )
    rating_mute_reason = _pick_mute_reason(ai_result, context, is_high_conf_brigade)

    public_note = ai_result.get("contextNote") or None
    if public_note is not None and not public_note.strip():
        public_note = None

    ai_signals = {
        "recommendedAction": ai_result["recommendedAction"],
        "isSpam": bool(ai_result["isSpam"]),
        "isBrigade": bool(ai_result["isBrigade"]),
        "brigadeConfidence": int(ai_result["brigadeConfidence"]),
        "commentQuality": int(ai_result["commentQuality"]),
        "ratingShouldBeDisabled": bool(ai_result["ratingShouldBeDisabled"]),
        "hardGateReason": hard_gate_reason or None,
    }

    return {
        "status": status,
        "ai_action": ai_action_enum,
        "ai_signals": ai_signals,
        "rating_muted": rating_muted,
        "rating_mute_reason": rating_mute_reason,
        "admin_note": _build_admin_note(ai_result, hard_gate_reason),
        "public_note": public_note,
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

            ok = apply_ai_moderation_decision(
                comment_id=comment_id,
                status=decision["status"],
                ai_action=decision["ai_action"],
                ai_quality=int(ai_result["commentQuality"]),
                ai_is_spam=bool(ai_result["isSpam"]),
                ai_is_brigade=bool(ai_result["isBrigade"]),
                ai_brigade_confidence=int(ai_result["brigadeConfidence"]),
                ai_signals=decision["ai_signals"],
                ai_reasoning=(ai_result.get("reasoning") or "").strip(),
                rating_muted=decision["rating_muted"],
                rating_mute_reason=decision["rating_mute_reason"],
                admin_note=decision["admin_note"],
                public_note=decision["public_note"],
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
