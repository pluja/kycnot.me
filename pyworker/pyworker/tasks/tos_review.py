"""
Task for retrieving Terms of Service (TOS) text.
"""

import os
from typing import Any, Dict, Optional

import requests

from pyworker.database import TosReviewType, create_kyc_edit_suggestion, save_tos_review
from pyworker.tasks.base import Task
from pyworker.utils.ai import prompt_check_tos_review, prompt_tos_review
from pyworker.utils.crawl import fetch_legal_corpus


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

        # Only process verified, approved, or community contributed services
        if verification_status not in [
            "VERIFICATION_SUCCESS",
            "APPROVED",
            "COMMUNITY_CONTRIBUTED",
        ]:
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

        review = self.get_tos_review(tos_urls, service.get("tosReview"), service_name)

        # Always update the processed timestamp, even if review is None
        save_tos_review(service_id, review)

        if review is None:
            self.logger.warning(
                f"TOS review could not be generated for service {service_name} (ID: {service_id})"
            )
            return None

        if "kycLevel" in review:
            new_level = review["kycLevel"]
            old_level = service.get("kycLevel")

            if old_level == new_level:
                self.logger.info(
                    f"KYC level unchanged for {service_name} (ID: {service_id}), skipping suggestion"
                )
            else:
                suggestion_id = create_kyc_edit_suggestion(
                    service_id=service_id,
                    old_level=old_level,
                    new_level=new_level,
                    review_summary=review.get("summary"),
                )

                if suggestion_id:
                    msg = (
                        f"{service.get('slug', service_name)}: "
                        f"KYC level suggestion #{suggestion_id} created ({old_level} → {new_level})"
                    )
                    self.logger.info(msg)

                    try:
                        ntfy_url = os.environ.get(
                            "NTFY_KYC_CHANGES_URL",
                            "https://ntfy.sh/knm-kyc-lvl-changes-knm",
                        )
                        requests.post(ntfy_url, data=msg.encode())
                    except requests.RequestException as e:
                        self.logger.error(
                            f"Failed to send ntfy notification for KYC suggestion: {e}"
                        )

        return review

    def get_tos_review(
        self,
        tos_urls: list[str],
        current_review: Optional[TosReviewType],
        service_name: str,
    ) -> Optional[TosReviewType]:
        """
        Build a legal corpus from all seed URLs (depth=1, legal-keyword filter)
        and run a single review pass over the combined content.
        """
        self.logger.info(f"Building legal corpus from seed URLs: {tos_urls}")
        combined, fetched_urls, corpus_hash = fetch_legal_corpus(tos_urls)

        if not combined:
            self.logger.warning(f"Empty legal corpus for seeds: {tos_urls}")
            return None

        self.logger.info(
            f"Corpus assembled: {len(fetched_urls)} pages, {len(combined)} chars, hash={corpus_hash[:12]}"
        )

        if current_review and current_review.get("contentHash") == corpus_hash:
            self.logger.info(f"Corpus unchanged (hash {corpus_hash[:12]}), skipping LLM call")
            return current_review

        # Drop pages that the fast model flags as blocked / incomplete before
        # the expensive review call.
        filtered_sections: list[str] = []
        for section in combined.split("===== PAGE: "):
            if not section.strip():
                continue
            section = "===== PAGE: " + section
            try:
                check = prompt_check_tos_review(section)
            except Exception as exc:
                self.logger.warning(f"Completeness check failed: {exc}; keeping section")
                filtered_sections.append(section)
                continue
            if check and check.get("isComplete"):
                filtered_sections.append(section)
            else:
                self.logger.info("Dropping incomplete page from corpus")

        if not filtered_sections:
            self.logger.warning("All corpus pages flagged incomplete")
            return None

        filtered_corpus = "\n\n".join(filtered_sections)
        review = prompt_tos_review(filtered_corpus, service_name)

        if review:
            review["contentHash"] = corpus_hash
            return review

        return None
