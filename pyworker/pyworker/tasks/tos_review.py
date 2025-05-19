"""
Task for retrieving Terms of Service (TOS) text.
"""

import hashlib
from typing import Any, Dict, Optional

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

        for tos_url in tos_urls:
            api_url = f"{tos_url}"
            self.logger.info(f"Fetching TOS from URL: {api_url}")

            # Sleep for 1 second to avoid rate limiting
            content = fetch_markdown(api_url)

            if content:
                # Hash the content to avoid repeating the same content
                content_hash = hashlib.sha256(content.encode()).hexdigest()
                self.logger.info(f"Content hash: {content_hash}")

                # service.get("tosReview") can be None if the DB field is NULL.
                # Default to an empty dict to prevent AttributeError on .get()
                tos_review_data_from_service: Optional[Dict[str, Any]] = service.get(
                    "tosReview"
                )
                tos_review: Dict[str, Any] = (
                    tos_review_data_from_service
                    if tos_review_data_from_service is not None
                    else {}
                )

                stored_hash = tos_review.get("contentHash")

                # Skip processing if we've seen this content before
                if stored_hash == content_hash:
                    self.logger.info(
                        f"Skipping already processed TOS content with hash: {content_hash}"
                    )
                    continue

                # Skip incomplete TOS content
                check = prompt_check_tos_review(content)
                if not check:
                    continue
                elif not check["isComplete"]:
                    continue

                # Query OpenAI to summarize the content
                review = prompt_tos_review(content)

                if review:
                    review["contentHash"] = content_hash
                    # Save the review to the database
                    save_tos_review(service_id, review)

                    # Update the KYC level based on the review
                    if "kycLevel" in review:
                        kyc_level = review["kycLevel"]
                        self.logger.info(
                            f"Updating KYC level to {kyc_level} for service {service_name}"
                        )
                        update_kyc_level(service_id, kyc_level)
                    # no need to check other TOS URLs
                    break

                return review
            else:
                self.logger.warning(
                    f"Failed to retrieve TOS content for URL: {tos_url}"
                )
