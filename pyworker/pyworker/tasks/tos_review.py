"""
Task for retrieving Terms of Service (TOS) text.
"""

import os
from typing import Any, Dict, Optional

import requests

from pyworker.database import (
    TosReviewType,
    create_kyc_edit_suggestion,
    save_tos_review,
)
from pyworker.tasks.base import Task
from pyworker.utils.ai import prompt_check_tos_review, prompt_tos_review
from pyworker.utils.legal_crawl import LegalCorpus, fetch_legal_corpus
from pyworker.utils.legal_changes import (
    record_document_changes,
    tracked_document_urls,
)
from pyworker.utils.legal_text import is_grounded

# A quote long enough to be a whole page is not a quote. Grounding only proves
# the text is somewhere in the corpus, so without a ceiling a model could
# "quote" the entire terms and pass.
MAX_EVIDENCE_CHARS = 600

# A review is only written for a listing the team has vetted. A
# community-contributed one is not shown a review in the UI, so reviewing it
# spends model budget and files KYC suggestions against a listing nobody has
# checked. Those are done on request, one service at a time.
REVIEWABLE_STATUSES = ("VERIFICATION_SUCCESS", "APPROVED")


class TosReviewTask(Task):
    """Task for retrieving Terms of Service (TOS) text."""

    def __init__(self, force: bool = False):
        super().__init__("tos_review")
        # Review again even when the corpus is unchanged, to carry existing
        # reviews onto a revised prompt. Costs one model call per service.
        self.force = force

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

        if verification_status not in REVIEWABLE_STATUSES:
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

        corpus = fetch_legal_corpus(
            tos_urls, known_urls=tracked_document_urls(service_id)
        )
        record_document_changes(service_id, corpus, service_name)

        review = self.get_tos_review(corpus, service.get("tosReview"), service_name)
        if review is not None:
            self.keep_supported_highlights(review, corpus)

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

    def keep_supported_highlights(self, review: Dict[str, Any], corpus) -> None:
        """Drop every highlight the crawled pages do not back up.

        This review publishes itself: it renders as a quoted clause on the
        service page and is emitted as a schema.org Review under kycnot.me's own
        name, with no reviewer in between. A highlight is a claim about the
        service, and the quote is what a reader is invited to check it against.
        Keeping the claim after finding its quote invented is the worst of both:
        an assertion nobody can check, made by a model we have just caught
        making one up.

        The address is taken from the page the quote was found in rather than
        from the model, so a clause cannot be attributed to the wrong document.
        """
        highlights = review.get("highlights")
        if not highlights:
            return

        kept = []
        for highlight in highlights:
            evidence = highlight.get("evidence") or ""
            if not evidence:
                self.logger.warning(
                    f"Dropping highlight with no quote: {highlight.get('title')!r}"
                )
                continue
            if len(evidence) > MAX_EVIDENCE_CHARS:
                self.logger.warning(
                    f"Dropping highlight quoting {len(evidence)} chars: {highlight.get('title')!r}"
                )
                continue

            source = next(
                (page for page in corpus.pages if is_grounded(evidence, page.markdown)),
                None,
            )
            if source is None:
                self.logger.warning(
                    f"Dropping highlight whose quote is in no crawled page: {evidence[:80]!r}"
                )
                continue

            highlight["sourceUrl"] = source.url
            kept.append(highlight)

        review["highlights"] = kept

    def get_tos_review(
        self,
        corpus: LegalCorpus,
        current_review: Optional[TosReviewType],
        service_name: str,
    ) -> Optional[TosReviewType]:
        """Run a single review pass over the combined legal corpus."""
        combined, fetched_urls, corpus_hash = (
            corpus.combined,
            corpus.urls,
            corpus.corpus_hash,
        )

        if not combined:
            self.logger.warning("Empty legal corpus")
            return None

        self.logger.info(
            f"Corpus assembled: {len(fetched_urls)} pages, {len(combined)} chars, hash={corpus_hash[:12]}"
        )

        if (
            not self.force
            and current_review
            and current_review.get("contentHash") == corpus_hash
        ):
            self.logger.info(
                f"Corpus unchanged (hash {corpus_hash[:12]}), skipping LLM call"
            )
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
                self.logger.warning(
                    f"Completeness check failed: {exc}; keeping section"
                )
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
