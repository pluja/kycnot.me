"""
Task for retrieving Terms of Service (TOS) text.
"""

import hashlib
from typing import Any, Dict, Optional, Literal

from pyworker.database import TosReviewType, save_tos_review, update_kyc_level
from pyworker.tasks.base import Task
from pyworker.utils.ai import prompt_check_tos_review, prompt_tos_review
from pyworker.utils.crawl import fetch_markdown


class TosReviewTask(Task):
    """Task for retrieving Terms of Service (TOS) text."""

    def __init__(self):
        """Initialize the TOS review task."""
        super().__init__("tos_review")

    def run(self, service: Dict[str, Any]) -> Optional[TosReviewType]:
        """
        Review TOS text for a service.

        Args:
            service: A dictionary containing service information.

        Returns:
            A dictionary mapping TOS URLs to their retrieved text, or None if no TOS URLs.
        """
        service_id = service["id"]
        service_name = service["name"]
        verification_status = service.get("verificationStatus")

        # Only process verified or approved services
        if verification_status not in ["VERIFICATION_SUCCESS", "APPROVED"]:
            self.logger.info(
                f"Skipping TOS review for service: {service_name} (ID: {service_id}) - Status: {verification_status}"
            )
            return None

        tos_urls = service.get("tosUrls", [])

        if not tos_urls:
            self.logger.info(
                f"No TOS URLs found for service: {service_name} (ID: {service_id})"
            )
            return None

        self.logger.info(
            f"Reviewing TOS for service: {service_name} (ID: {service_id})"
        )
        self.logger.info(f"TOS URLs: {tos_urls}")

        review = self.get_tos_review(tos_urls, service.get("tosReview"))
        save_tos_review(service_id, review)

        # Update the KYC level based on the review
        if "kycLevel" in review:
            kyc_level = review["kycLevel"]
            self.logger.info(f"Updating KYC level to {kyc_level} for service {service_name}")
            update_kyc_level(service_id, kyc_level)

        return review

    def get_tos_review(
        self, tos_urls: list[str], current_review: Optional[TosReviewType]
    ) -> Optional[TosReviewType]:
        """
        Get TOS review from a list of URLs.

        Args:
            tos_urls: List of TOS URLs to check
            current_review: Current review data from the database

        Returns:
            Dict containing:
            - status: Literal["skipped", "failed", "success"]
            - review: Optional[TosReviewType] - The review data if successful
        """
        all_skipped = True

        for tos_url in tos_urls:
            api_url = f"{tos_url}"
            self.logger.info(f"Fetching TOS from URL: {api_url}")

            content = fetch_markdown(api_url)

            if not content:
                self.logger.warning(f"Failed to retrieve TOS content for URL: {tos_url}")
                all_skipped = False
                continue

            # Hash the content to avoid repeating the same content
            content_hash = hashlib.sha256(content.encode()).hexdigest()
            self.logger.info(f"Content hash: {content_hash}")

            # Skip processing if we've seen this content before
            if current_review and current_review.get("contentHash") == content_hash:
                self.logger.info(
                    f"Skipping already processed TOS content with hash: {content_hash}"
                )
                continue

            all_skipped = False

            # Skip incomplete TOS content
            check = prompt_check_tos_review(content)
            if not check or not check["isComplete"]:
                continue

            # Query OpenAI to summarize the content
            review = prompt_tos_review(content)

            if review:
                review["contentHash"] = content_hash
                return review

        if all_skipped:
            return current_review

        return None
