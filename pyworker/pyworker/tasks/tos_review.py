"""
Task for retrieving Terms of Service (TOS) text.
"""

import os
from typing import Any, Dict, Optional

import requests

from pyworker.database import (
    TosReviewType,
    create_kyc_edit_suggestion,
    create_legal_revision,
    get_legal_documents,
    save_tos_review,
    upsert_legal_document,
)
from pyworker.tasks.base import Task
from pyworker.utils.ai import (
    prompt_check_tos_review,
    prompt_legal_change_summary,
    prompt_tos_review,
)
from pyworker.utils.crawl import LegalCorpus, fetch_legal_corpus
from pyworker.utils.legal_text import (
    LegalChangeLevel,
    diff_legal_text,
    is_usable_legal_page,
)


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

        # Only process verified or approved services. Community-contributed
        # listings are excluded: their TOS review is never shown in the UI, so
        # reviewing them only spends AI budget and files unactionable KYC
        # suggestions on listings the team has not vetted.
        if verification_status not in [
            "VERIFICATION_SUCCESS",
            "APPROVED",
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

        corpus = fetch_legal_corpus(tos_urls)
        self.record_document_changes(service_id, corpus, service_name)

        review = self.get_tos_review(corpus, service.get("tosReview"), service_name)

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

    def record_document_changes(
        self, service_id: int, corpus: LegalCorpus, service_name: str = ""
    ) -> None:
        """Store each crawled page and log the ones whose text actually moved.

        Detection is deterministic: normalization has already removed the
        republish noise, so a surviving difference is a real edit. Nothing here
        calls a model, which keeps a service unable to talk the detector out of
        noticing a change to its own terms.
        """
        stored = get_legal_documents(service_id)
        self.record_removed_documents(service_id, corpus, stored)

        for page in corpus.pages:
            if not is_usable_legal_page(page.normalized_text):
                self.logger.info(
                    f"Skipping unusable legal page for service {service_id}: {page.url} "
                    f"({len(page.normalized_text)} chars)"
                )
                continue

            previous = stored.get(page.url_key)
            diff = (
                diff_legal_text(previous["normalizedText"], page.normalized_text)
                if previous
                else None
            )
            changed = previous is not None and diff is not None and diff.level is not LegalChangeLevel.NONE

            document_id = upsert_legal_document(
                service_id=service_id,
                url_key=page.url_key,
                url=page.url,
                kind=page.kind.value,
                content_hash=page.content_hash,
                normalized_text=page.normalized_text,
                changed=changed,
            )

            if not changed or document_id is None or diff is None:
                continue

            create_legal_revision(
                service_id=service_id,
                document_id=document_id,
                change_level=diff.level.value,
                changed_words=diff.changed_words,
                summary=self.summarize_change(diff.level, diff.hunks, service_name, page.kind.value),
                diff=diff.hunks,
            )
            self.logger.info(
                f"Legal change recorded for service {service_id}: {page.url} "
                f"({diff.level.value}, {diff.changed_words} words)"
            )

    def record_removed_documents(
        self,
        service_id: int,
        corpus: LegalCorpus,
        stored: Dict[str, Any],
    ) -> None:
        """Log documents that were stored before but are absent from this crawl.

        Deleting a page is an edit like any other, and without this a service
        could drop a clause by dropping the page that carried it. Skipped when
        the crawl returned nothing at all, since that is far more likely to be
        an outage than every document being withdrawn at once.
        """
        if not corpus.pages:
            return

        crawled = {page.url_key for page in corpus.pages}
        for url_key, document in stored.items():
            if url_key in crawled or not document.get("normalizedText"):
                continue
            create_legal_revision(
                service_id=service_id,
                document_id=document["id"],
                change_level=LegalChangeLevel.MATERIAL.value,
                changed_words=0,
                summary="The document is no longer published at this address.",
                diff=None,
            )
            self.logger.info(f"Legal document removed for service {service_id}: {url_key}")

    def summarize_change(
        self, level: LegalChangeLevel, hunks: str, service_name: str, document_kind: str
    ) -> Optional[str]:
        """Describe a material change in plain English, or return None.

        Minor edits are recorded without a summary: a reworded sentence does not
        warrant a model call, and an empty summary reads better than one
        explaining that nothing meaningful happened.
        """
        if level is not LegalChangeLevel.MATERIAL or not hunks:
            return None
        try:
            return prompt_legal_change_summary(hunks, service_name, document_kind)
        except Exception as exc:
            self.logger.warning(f"Legal change summary failed: {exc}")
            return None

    def get_tos_review(
        self,
        corpus: LegalCorpus,
        current_review: Optional[TosReviewType],
        service_name: str,
    ) -> Optional[TosReviewType]:
        """Run a single review pass over the combined legal corpus."""
        combined, fetched_urls, corpus_hash = corpus.combined, corpus.urls, corpus.corpus_hash

        if not combined:
            self.logger.warning("Empty legal corpus")
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
