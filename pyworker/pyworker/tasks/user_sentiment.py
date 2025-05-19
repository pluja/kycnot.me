"""
Task for summarizing comments and getting overal sentiment
"""

import json
from datetime import datetime
from typing import Any, Dict, Optional

from pyworker.database import (
    CommentSentimentSummaryType,
    get_comments,
    get_max_comment_updated_at,
    save_user_sentiment,
)
from pyworker.tasks.base import Task
from pyworker.utils.ai import (
    prompt_comment_sentiment_summary,
)


class DateTimeEncoder(json.JSONEncoder):
    def default(self, o: Any) -> Any:
        if isinstance(o, datetime):
            return o.isoformat()
        return super().default(o)


class UserSentimentTask(Task):
    """Task for summarizing comments and getting overal sentiment"""

    def __init__(self):
        """Initialize the comment sentiment summary task."""
        super().__init__("comment_sentiment_summary")

    def run(self, service: Dict[str, Any]) -> Optional[CommentSentimentSummaryType]:
        """
        Run the comment sentiment summary task.
        Skips execution if no new comments are found since the last run.
        Clears sentiment if all comments are removed.
        """
        service_id = service["id"]
        service_name = service["name"]
        current_user_sentiment_at: Optional[datetime] = service.get("userSentimentAt")

        if isinstance(current_user_sentiment_at, str):
            try:
                current_user_sentiment_at = datetime.fromisoformat(
                    str(current_user_sentiment_at).replace("Z", "+00:00")
                )
            except ValueError:
                self.logger.warning(
                    f"Could not parse userSentimentAt string '{current_user_sentiment_at}' for service {service_id}. Treating as None."
                )
                current_user_sentiment_at = None

        # Get the timestamp of the most recent approved comment
        max_comment_updated_at = get_max_comment_updated_at(
            service_id, status="APPROVED"
        )

        self.logger.info(
            f"Service {service_name} (ID: {service_id}): Current userSentimentAt: {current_user_sentiment_at}, Max approved comment updatedAt: {max_comment_updated_at}"
        )

        if max_comment_updated_at is None:
            self.logger.info(
                f"No approved comments found for service {service_name} (ID: {service_id})."
            )
            # If there was a sentiment before and now no comments, clear it.
            if service.get("userSentiment") is not None:
                self.logger.info(
                    f"Clearing existing sentiment for service {service_name} (ID: {service_id}) as no approved comments are present."
                )
                save_user_sentiment(service_id, None, None)
            return None

        if (
            current_user_sentiment_at is not None
            and max_comment_updated_at <= current_user_sentiment_at
        ):
            self.logger.info(
                f"No new approved comments for service {service_name} (ID: {service_id}) since last sentiment analysis ({current_user_sentiment_at}). Skipping."
            )
            # Optionally, return the existing sentiment if needed:
            # existing_sentiment = service.get("userSentiment")
            # return existing_sentiment if isinstance(existing_sentiment, dict) else None
            return None

        # Query the approved comments for the service
        # get_comments defaults to status="APPROVED"
        comments = get_comments(service_id)

        self.logger.info(
            f"Found {len(comments)} comments for service {service_name} (ID: {service_id}) to process."
        )

        if not comments:
            # This case could occur if max_comment_updated_at found a comment,
            # but get_comments filters it out or it was deleted just before get_comments ran.
            self.logger.info(
                f"No comments to process for service {service_name} (ID: {service_id}) after fetching (e.g. due to filtering or deletion)."
            )
            if service.get("userSentiment") is not None:
                self.logger.info(
                    f"Clearing existing sentiment for service {service_name} (ID: {service_id}) as no processable comments found."
                )
                # Use max_comment_updated_at as the reference point for when this check was made.
                save_user_sentiment(service_id, None, max_comment_updated_at)
            return None

        # Query OpenAI to get the sentiment summary
        try:
            sentiment_summary = prompt_comment_sentiment_summary(
                json.dumps(comments, cls=DateTimeEncoder)
            )
        except Exception as e:
            self.logger.error(
                f"Failed to generate sentiment summary for service {service_name} (ID: {service_id}): {e}"
            )
            return None

        if not sentiment_summary:  # Defensive check if prompt could return None/empty
            self.logger.warning(
                f"Sentiment summary generation returned empty for service {service_name} (ID: {service_id})."
            )
            return None

        # Save the sentiment summary to the database, using max_comment_updated_at
        save_user_sentiment(service_id, sentiment_summary, max_comment_updated_at)
        self.logger.info(
            f"Successfully processed and saved user sentiment for service {service_name} (ID: {service_id})."
        )

        return sentiment_summary
