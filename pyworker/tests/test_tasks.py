"""
Tests for task modules.
"""

import unittest
from unittest.mock import patch, MagicMock
from typing import Dict, Any

from pyworker.cli import (
    group_task_schedules,
    is_disabled_schedule,
    should_use_scheduler_task_instance,
)
from pyworker.tasks import TosReviewTask
from pyworker.utils.legal_crawl import LegalCorpus, LegalPage
from pyworker.utils.legal_text import LegalDocumentKind


class TestWorkerSchedules(unittest.TestCase):
    def test_detects_disabled_cron_values(self):
        for value in ("", "disabled", "DISABLED", " off ", "false", "none"):
            self.assertTrue(is_disabled_schedule(value))

    def test_keeps_regular_cron_values_enabled(self):
        self.assertFalse(is_disabled_schedule("0 0 * * *"))

    def test_skips_scheduler_instances_for_function_backed_tasks(self):
        self.assertFalse(should_use_scheduler_task_instance("deep_scan"))
        self.assertFalse(should_use_scheduler_task_instance("service_score_recalc_all"))
        self.assertTrue(should_use_scheduler_task_instance("tosreview"))

    def test_missing_cron_values_are_not_scheduled(self):
        enabled_schedules, disabled_task_names = group_task_schedules(
            {
                "deep_scan": "* * * * *",
                "tosreview": "off",
            }
        )

        self.assertEqual(enabled_schedules, {"deep_scan": "* * * * *"})
        self.assertEqual(disabled_task_names, ["tosreview"])


class TestTosReviewTask(unittest.TestCase):
    """Tests for the TosReviewTask."""

    def setUp(self):
        self.task = TosReviewTask()

    def test_run_no_urls(self):
        service: Dict[str, Any] = {
            "id": 1,
            "name": "Service With No TOS",
            "verificationStatus": "APPROVED",
            "tosUrls": [],
        }
        result = self.task.run(service)
        self.assertIsNone(result)

    def test_run_skips_unverified_service(self):
        service: Dict[str, Any] = {
            "id": 2,
            "name": "Unverified Service",
            "verificationStatus": "PENDING",
            "tosUrls": ["https://example.com/tos"],
        }
        result = self.task.run(service)
        self.assertIsNone(result)

    @patch("pyworker.tasks.tos_review.record_document_changes")
    @patch("pyworker.tasks.tos_review.save_tos_review")
    @patch("pyworker.tasks.tos_review.fetch_legal_corpus")
    def test_run_skips_when_corpus_unchanged(
        self,
        mock_corpus: MagicMock,
        mock_save: MagicMock,
        mock_record: MagicMock,
    ):
        corpus_hash = "a" * 64
        mock_corpus.return_value = LegalCorpus(
            pages=[
                LegalPage(
                    url_key="x",
                    url="https://x",
                    kind=LegalDocumentKind.TERMS,
                    markdown="body",
                    normalized_text="body",
                    content_hash=corpus_hash,
                )
            ],
            combined="===== PAGE: x =====\nbody\n===== END PAGE =====",
            corpus_hash=corpus_hash,
        )
        service: Dict[str, Any] = {
            "id": 3,
            "name": "Test Service",
            "verificationStatus": "APPROVED",
            "tosUrls": ["https://example.com/tos"],
            "tosReview": {"contentHash": corpus_hash},
        }

        self.task.run(service)
        mock_save.assert_called_once_with(3, {"contentHash": corpus_hash})

    @patch(
        "pyworker.tasks.tos_review.prompt_check_tos_review",
        return_value={"isComplete": True},
    )
    @patch("pyworker.tasks.tos_review.prompt_tos_review")
    @patch("pyworker.tasks.tos_review.record_document_changes")
    @patch("pyworker.tasks.tos_review.save_tos_review")
    @patch("pyworker.tasks.tos_review.fetch_legal_corpus")
    def test_force_reviews_an_unchanged_corpus(
        self,
        mock_corpus: MagicMock,
        mock_save: MagicMock,
        mock_record: MagicMock,
        mock_prompt: MagicMock,
        mock_check: MagicMock,
    ):
        corpus_hash = "b" * 64
        mock_corpus.return_value = LegalCorpus(
            pages=[
                LegalPage(
                    url_key="x",
                    url="https://x",
                    kind=LegalDocumentKind.TERMS,
                    markdown="body",
                    normalized_text="body",
                    content_hash=corpus_hash,
                )
            ],
            combined="===== PAGE: x =====\nbody\n===== END PAGE =====",
            corpus_hash=corpus_hash,
        )
        mock_prompt.return_value = {"summary": "fresh", "highlights": []}
        service: Dict[str, Any] = {
            "id": 4,
            "name": "Test Service",
            "verificationStatus": "APPROVED",
            "tosUrls": ["https://example.com/tos"],
            "tosReview": {"contentHash": corpus_hash, "summary": "stale"},
        }

        TosReviewTask(force=True).run(service)

        mock_prompt.assert_called_once()
        self.assertEqual(mock_save.call_args[0][1]["summary"], "fresh")


if __name__ == "__main__":
    unittest.main()


class SupportedHighlightsTests(unittest.TestCase):
    """What a review is allowed to say about a service without a reviewer."""

    QUOTE = "we may require identity verification at any time and for any reason"

    def setUp(self):
        from pyworker.tasks.tos_review import TosReviewTask
        from pyworker.utils.legal_crawl import LegalCorpus, LegalPage

        self.task = TosReviewTask()
        self.terms = LegalPage(
            url_key="x.com/terms",
            url="https://x.com/terms",
            kind="TERMS",
            markdown=f"Section 4. {self.QUOTE}. Section 5.",
            normalized_text="",
            content_hash="a",
        )
        self.privacy = LegalPage(
            url_key="x.com/privacy",
            url="https://x.com/privacy",
            kind="PRIVACY",
            markdown="We keep logs for twelve months and share them on request.",
            normalized_text="",
            content_hash="b",
        )
        self.corpus = LegalCorpus(
            pages=[self.terms, self.privacy], combined="", corpus_hash=""
        )

    def _review(self, **highlight):
        review = {
            "highlights": [
                {"title": "T", "content": "C", "rating": "negative", **highlight}
            ]
        }
        self.task.keep_supported_highlights(review, self.corpus)
        return review["highlights"]

    def test_a_quoted_claim_is_kept(self):
        kept = self._review(evidence=self.QUOTE)

        self.assertEqual(len(kept), 1)

    def test_the_address_comes_from_the_page_holding_the_quote(self):
        # Not from the model, which can attribute a clause to the wrong document
        # and send a reader to a page that never said it.
        kept = self._review(evidence=self.QUOTE, sourceUrl="https://x.com/privacy")

        self.assertEqual(kept[0]["sourceUrl"], "https://x.com/terms")

    def test_a_claim_with_an_invented_quote_is_dropped_whole(self):
        # Keeping the claim without its quote publishes an assertion nobody can
        # check, from a model just caught inventing one.
        kept = self._review(evidence="we never ask anyone for identity documents")

        self.assertEqual(kept, [])

    def test_a_claim_with_no_quote_at_all_is_dropped(self):
        kept = self._review()

        self.assertEqual(kept, [])
