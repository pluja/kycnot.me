"""
Task for summarizing comments and getting overal sentiment
"""

import json
from datetime import datetime
from typing import Any, Dict, List

# Import types from database.py
from pyworker.database import (  # type: ignore
    CommentType,
    get_comment_by_id,
    get_pending_comments,
    get_recent_approved_comments,
    get_recent_approved_order_ids,
    update_comment_moderation,
)
from pyworker.tasks.base import Task  # type: ignore
from pyworker.utils.ai import prompt_comment_moderation


class DateTimeEncoder(json.JSONEncoder):
    def default(self, o: Any) -> Any:
        if isinstance(o, datetime):
            return o.isoformat()
        return super().default(o)


class CommentModerationTask(Task):
    """Task for summarizing comments and getting overal sentiment"""

    def __init__(self):
        """Initialize the comment moderation task."""
        super().__init__("comment_moderation")

    def run(self, service: Dict[str, Any]) -> bool:
        """
        Run the comment moderation task.
        Returns True if comments were processed, False otherwise.
        """
        service_id = service["id"]
        service_name = service["name"]

        comments: List[Dict[str, Any]] = get_pending_comments(service_id)

        if not comments:
            self.logger.info(
                f"No pending comments found for service {service_name} (ID: {service_id}) during task run."
            )
            return False

        self.logger.info(
            f"Found {len(comments)} pending comments for service {service_name} (ID: {service_id}). Starting processing."
        )

        # Fetch context once per service run
        approved_comments = get_recent_approved_comments(service_id)
        approved_order_ids = get_recent_approved_order_ids(service_id)

        processed_at_least_one = False
        for comment_data in comments:
            comment: CommentType = comment_data  # type: ignore

            # Fetch parent comment if this is a reply
            parent_comment = None
            parent_id = comment.get("parentId")
            if parent_id:
                parent_comment = get_comment_by_id(parent_id)

            context = {
                "service": {
                    "name": service["name"],
                    "description": service["description"],
                    "kycLevel": service["kycLevel"],
                },
                "comment": comment,
                "parentComment": parent_comment,
                "recentApprovedComments": approved_comments,
                "recentApprovedOrderIds": approved_order_ids
                if comment.get("orderId")
                else None,
            }

            moderation = prompt_comment_moderation(
                json.dumps(context, cls=DateTimeEncoder)
            )

            quality = moderation["commentQuality"]
            is_spam = moderation["isSpam"]

            # AI never sets status — it only writes its assessment for human review.
            # Status stays PENDING so the comment appears in the admin queue.
            comment["requiresAdminReview"] = bool(moderation["requiresAdminReview"])

            ai_notes: List[str] = []
            ai_notes.append(f"AI quality: {quality}/10 | spam: {is_spam}")
            if moderation.get("internalNote"):
                ai_notes.append(moderation["internalNote"])
            comment["internalNote"] = " — ".join(ai_notes)

            comment["communityNote"] = moderation.get("contextNote") or None

            modstring = (
                f"Comment {comment['id']} triaged: "
                f"quality={quality}, spam={is_spam}, "
                f"adminReview={comment['requiresAdminReview']}"
            )
            if comment["communityNote"]:
                modstring += f", note: {comment['communityNote']}"

            self.logger.info(modstring)
            update_comment_moderation(comment)
            processed_at_least_one = True

        return processed_at_least_one
