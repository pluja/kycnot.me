"""
Task for summarizing comments and getting overal sentiment
"""

import json
from datetime import datetime
from typing import Any, Dict, List

# Import types from database.py
from pyworker.database import (  # type: ignore
    CommentType,
    get_comments,
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

        # Query the approved comments for the service
        # get_comments is type ignored, so we assume it returns List[Dict[str, Any]]
        comments: List[Dict[str, Any]] = get_comments(service_id, status="PENDING")

        if not comments:
            self.logger.info(
                f"No pending comments found for service {service_name} (ID: {service_id}) during task run."
            )
            return False

        self.logger.info(
            f"Found {len(comments)} pending comments for service {service_name} (ID: {service_id}). Starting processing."
        )

        processed_at_least_one = False
        for comment_data in comments:
            # Assert the type for the individual dictionary for type checking within the loop
            comment: CommentType = comment_data  # type: ignore

            # Query OpenAI to get the sentiment summary
            moderation = prompt_comment_moderation(
                f"Information about the service: {service}\\nCurrent time: {datetime.now()}\\n\\nComment to moderate: {json.dumps(comment, cls=DateTimeEncoder)}"
            )

            modstring = f"Comment {comment['id']} "

            if moderation["isSpam"] and moderation["commentQuality"] > 5:
                comment["status"] = "HUMAN_PENDING"
                modstring += " marked as HUMAN_PENDING"
            elif moderation["isSpam"] and moderation["commentQuality"] <= 5:
                comment["status"] = "REJECTED"
                modstring += " marked as REJECTED"

            if moderation["requiresAdminReview"]:
                comment["requiresAdminReview"] = True
                modstring += " requires admin review"
                # Ensure status is HUMAN_PENDING if admin review is required, unless already REJECTED
                if comment.get("status") != "REJECTED":
                    comment["status"] = "HUMAN_PENDING"
                    if (
                        "marked as HUMAN_PENDING" not in modstring
                    ):  # Avoid duplicate message
                        modstring += " marked as HUMAN_PENDING"
            else:
                comment["requiresAdminReview"] = False
                if (
                    comment.get("status") != "HUMAN_PENDING"
                    and comment.get("status") != "REJECTED"
                ):
                    comment["status"] = "APPROVED"
                    modstring += " marked as APPROVED"

            if moderation.get("moderationNote"):  # Check if key exists
                comment["communityNote"] = moderation["contextNote"]
                modstring += " with moderation note: " + moderation["contextNote"]
            else:
                comment["communityNote"] = None

            if moderation.get("internalNote"):  # Check if key exists
                comment["internalNote"] = moderation["internalNote"]
                modstring += (
                    " with internal note: " + moderation["internalNote"]
                )  # Changed from spam reason for clarity
            else:
                comment["internalNote"] = None

            # Save the sentiment summary to the database
            self.logger.info(f"{modstring}")
            update_comment_moderation(comment)
            processed_at_least_one = True

        return processed_at_least_one
