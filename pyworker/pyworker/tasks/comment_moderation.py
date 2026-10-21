"""Moderate pending public posts without sending private evidence to AI."""

import json
from difflib import SequenceMatcher
from datetime import datetime
from typing import Any, Dict, List, Mapping

from pyworker.database import (  # type: ignore
    apply_ai_edit_decision,
    apply_ai_moderation_decision,
    get_moderation_context,
    get_pending_comments,
    get_pending_revisions,
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


# Claims of harm a post may only make with proof (requiresProof in web/src/constants/commentIssueTypes.ts).
# They go live once a moderator accepts that proof; other posts never wait for a proof check.
_HARM_CLAIMS = frozenset({"KYC_REQUESTED", "FUNDS_BLOCKED"})
CLAIM_GATE_REASON = "claim awaiting a proof check"

# Rejections for these rules count against the author's trust (web/prisma/triggers/18_user_trust.sql).
_PENALIZING_RULES = frozenset(
    {
        "SPAM",
        "SCAM_CONTACT",
        "HARASSMENT",
        "SLUR",
        "PRIVATE_INFO",
        "NOT_GENUINE",
        "PAID_PROMOTION",
    }
)
# The AI applies only these on its own, and only when sure; a person judges every other strike.
_CLEAR_CUT_RULES = frozenset({"SPAM", "SCAM_CONTACT", "SLUR", "PRIVATE_INFO"})


def _decide(ai_result: Mapping[str, Any], context: Mapping[str, Any]) -> Dict[str, Any]:
    """Combine the AI recommendation with server-side hard gates."""
    submission = context["comment"]["submission"]
    author = context["comment"]["author"]
    service = context["service"]

    is_high_conf_brigade = (
        bool(ai_result["isBrigade"])
        and int(ai_result["brigadeConfidence"]) >= _BRIGADE_HARD_GATE_CONFIDENCE
    )

    hard_gate_reasons: List[str] = []
    if ai_result.get("isSpam"):
        hard_gate_reasons.append("spam flag needs a consistent publication decision")
    if service.get("strictCommentingEnabled"):
        hard_gate_reasons.append("strict commenting")
    if _HARM_CLAIMS.intersection(submission.get("issues") or []) and not submission.get(
        "hasAcceptedProof"
    ):
        hard_gate_reasons.append(CLAIM_GATE_REASON)
    # A change of sentiment, outcome or problems is how pressure to soften a review shows up, so a person
    # always confirms it. Text-only edits stay with the AI.
    if submission.get("changesVerdict"):
        hard_gate_reasons.append("update changes the experience verdict")
    for flag, reason in (
        ("proofIdReused", "order ID used on another post"),
        ("proofIdOffFormat", "order ID does not match the service format"),
        ("newAccountWave", "wave of new-account posts"),
    ):
        if submission.get(flag):
            hard_gate_reasons.append(reason)
    if ai_result.get("looksGenerated"):
        hard_gate_reasons.append("text looks generated or templated")
    if is_high_conf_brigade:
        hard_gate_reasons.append(
            f"brigade confidence {ai_result['brigadeConfidence']}/5"
        )
    if (author.get("trust") or {}).get("postingDisabled"):
        hard_gate_reasons.append("author's posting is disabled")
    if (author.get("trust") or {}).get("isUntrusted"):
        hard_gate_reasons.append("author has recent penalized rejections")

    hard_gate_reason = ", ".join(hard_gate_reasons)
    recommended_action = ai_result["recommendedAction"]

    # Proof or a tagged claim is a first-hand specific, so the AI never rejects such a post on its own for lack of detail.
    if (
        recommended_action == "reject"
        and ai_result.get("rejectionRule") == "NOT_ENOUGH_DETAIL"
        and (submission.get("hasPrivateProof") or submission.get("issues"))
    ):
        recommended_action = "human_review"
    # Hard gates only block auto-APPROVE. REJECT and HOLD pass through so
    # obvious trash gets removed and explicit human-review requests don't
    # get masked behind a generic "hard gate" hold.
    if hard_gate_reasons and recommended_action == "approve":
        status = "PENDING"
        ai_action_enum = "HOLD"
    else:
        status = _ACTION_TO_STATUS[recommended_action]
        ai_action_enum = _ACTION_TO_ENUM[recommended_action]

    # A rejection records which rule it broke, so it can count against the author's trust.
    rejection_rule = None
    if status == "REJECTED":
        fallback_rule = "SPAM" if ai_result.get("isSpam") else "OTHER"
        rejection_rule = ai_result.get("rejectionRule") or fallback_rule
        clear_cut = (
            rejection_rule in _CLEAR_CUT_RULES
            and ai_result.get("rejectionConfident") is True
        )
        if rejection_rule in _PENALIZING_RULES and not clear_cut:
            hard_gate_reason = ", ".join(
                filter(
                    None,
                    [
                        hard_gate_reason,
                        f"possible {rejection_rule.lower().replace('_', ' ')}",
                    ],
                )
            )
            status, ai_action_enum, rejection_rule = "PENDING", "HOLD", None

    ai_signals = {
        "recommendedAction": ai_result["recommendedAction"],
        "isSpam": bool(ai_result["isSpam"]),
        "isBrigade": bool(ai_result["isBrigade"]),
        "brigadeConfidence": int(ai_result["brigadeConfidence"]),
        "looksGenerated": bool(ai_result.get("looksGenerated")),
        "commentQuality": int(ai_result["commentQuality"]),
        "hardGateReason": hard_gate_reason or None,
    }

    return {
        "status": status,
        "ai_action": ai_action_enum,
        "ai_signals": ai_signals,
        "rejection_rule": rejection_rule,
        "hard_gate_reason": hard_gate_reason,
    }


# An edit to a proof-checked experience waits for a moderator when more than this share of
# the text is new: the badge vouches for the order, not for claims written after the check.
_CHECKED_PROOF_REWRITE_SHARE = 0.5


def _new_text_share(published: str, edited: str) -> float:
    """Share of the longer text that the edit does not keep from the published one."""
    longest = max(len(published), len(edited))
    if longest == 0:
        return 0.0
    matcher = SequenceMatcher(None, published, edited, autojunk=False)
    kept = sum(block.size for block in matcher.get_matching_blocks())
    return 1 - kept / longest


def _decide_edit(
    ai_result: Mapping[str, Any], context: Mapping[str, Any]
) -> Dict[str, Any]:
    """Approve, reject or hold an edit to a published post, using the post's hard gates."""
    decision = _decide(ai_result, context)
    rule = decision["rejection_rule"]
    submission = context["comment"]["submission"]
    # A moderator is already involved, or the edit changes what kind of post this is.
    needs_moderator = [
        reason
        for flag, reason in (
            ("hasOpenReport", "the comment has an open report"),
            ("heldByModerator", "a moderator held the comment"),
            ("changesKind", "the edit changes the comment type"),
            (
                "rewritesCheckedExperience",
                "the edit rewrites most of a proof-checked experience",
            ),
        )
        if submission.get(flag)
    ]
    if needs_moderator and decision["status"] == "APPROVED":
        return {
            "action": "HOLD",
            "rejection_rule": None,
            "hard_gate_reason": ", ".join(
                filter(None, [decision["hard_gate_reason"], *needs_moderator])
            ),
        }
    if decision["status"] == "APPROVED":
        action = "APPROVE"
    # A rejected edit leaves the published version live, so the AI rejects an edit only for a clear-cut rule.
    elif decision["status"] == "REJECTED" and rule in _CLEAR_CUT_RULES:
        action = "REJECT"
    else:
        action = "HOLD"
    return {
        "action": action,
        "rejection_rule": rule if action == "REJECT" else None,
        "hard_gate_reason": decision["hard_gate_reason"],
    }


def _edit_context(
    context: Dict[str, Any], revision: Mapping[str, Any]
) -> Dict[str, Any]:
    """The post's moderation context with the edited text in place of the published one."""
    comment = {**context["comment"], "content": revision["content"]}
    comment["submission"] = {
        **comment["submission"],
        "kind": revision["kind"],
        # Only claims the edit adds wait for proof; the published post already passed that gate.
        "issues": [
            issue
            for issue in revision.get("editedIssues") or []
            if issue not in (revision.get("publishedIssues") or [])
        ],
        "isEditOfPublishedPost": True,
        # An edit changes neither the proof nor when the post arrived.
        "proofIdReused": False,
        "proofIdOffFormat": False,
        "newAccountWave": False,
        "changesVerdict": bool(revision["changesVerdict"]),
        "experienceHasCheckedProof": bool(revision["experienceHasCheckedProof"]),
        "changesKind": bool(revision["changesKind"]),
        "heldByModerator": bool(revision["heldByModerator"]),
        "hasOpenReport": bool(revision["hasOpenReport"]),
        "rewritesCheckedExperience": bool(revision["experienceHasCheckedProof"])
        and _new_text_share(revision["publishedContent"], revision["content"])
        > _CHECKED_PROOF_REWRITE_SHARE,
    }
    return {**context, "comment": comment}


class CommentModerationTask(Task):
    """Decides on pending comments for a single service."""

    def __init__(self):
        super().__init__("comment_moderation")

    def run(self, service: Dict[str, Any]) -> bool:
        service_id = service["id"]
        service_name = service["name"]

        comments = get_pending_comments(service_id)

        if comments:
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
                expected_version=comment_row["version"],
                sentiment=ai_result.get("experienceSentiment"),
                kind=ai_result.get("postKind"),
                status=decision["status"],
                ai_action=decision["ai_action"],
                ai_quality=int(ai_result["commentQuality"]),
                ai_is_spam=bool(ai_result["isSpam"]),
                ai_is_brigade=bool(ai_result["isBrigade"]),
                ai_brigade_confidence=int(ai_result["brigadeConfidence"]),
                ai_signals=decision["ai_signals"],
                ai_reasoning=(ai_result.get("reasoning") or "").strip(),
                rejection_rule=decision["rejection_rule"],
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

        for revision in get_pending_revisions(service_id):
            context = get_moderation_context(revision["commentId"], revision["content"])
            if context is None:
                continue
            edit_context = _edit_context(context, revision)
            try:
                ai_result = prompt_comment_moderation(
                    json.dumps(edit_context, cls=_DateTimeEncoder)
                )
            except Exception as e:
                self.logger.error(
                    f"AI call failed for edit {revision['id']}: {e}; leaving pending."
                )
                continue
            decision = _decide_edit(ai_result, edit_context)
            try:
                outcome = apply_ai_edit_decision(
                    revision_id=revision["id"],
                    ai_action=decision["action"],
                    ai_reasoning=(ai_result.get("reasoning") or "").strip(),
                    rejection_rule=decision["rejection_rule"],
                )
            except Exception as e:
                self.logger.error(
                    f"Could not record the decision on edit {revision['id']}: {e}"
                )
                continue
            self.logger.info(
                f"Edit {revision['id']} on comment {revision['commentId']}: {outcome} "
                f"hardGate=({decision['hard_gate_reason'] or 'none'})"
            )
            processed_at_least_one = True

        return processed_at_least_one
