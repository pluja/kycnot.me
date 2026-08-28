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
from pyworker.utils.crawl import LegalCorpus, LegalPage
from pyworker.utils.legal_text import LegalChangeLevel, LegalDocumentKind


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

    @patch("pyworker.tasks.tos_review.upsert_legal_document", return_value=1)
    @patch("pyworker.tasks.tos_review.get_legal_documents", return_value={})
    @patch("pyworker.tasks.tos_review.save_tos_review")
    @patch("pyworker.tasks.tos_review.fetch_legal_corpus")
    def test_run_skips_when_corpus_unchanged(
        self,
        mock_corpus: MagicMock,
        mock_save: MagicMock,
        mock_docs: MagicMock,
        mock_upsert: MagicMock,
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


if __name__ == "__main__":
    unittest.main()


class TestRecordDocumentChanges(unittest.TestCase):
    """The change log must record real edits and ignore republish noise."""

    def setUp(self):
        self.task = TosReviewTask()

    FILLER = "\n".join(f"Clause {i} is unchanged boilerplate text." for i in range(30))

    @classmethod
    def _corpus(cls, text: str) -> LegalCorpus:
        from pyworker.utils.legal_text import legal_content_hash, normalize_legal_markdown

        text = f"{text}\n{cls.FILLER}"
        page = LegalPage(
            url_key="x.com/terms",
            url="https://x.com/terms",
            kind=LegalDocumentKind.TERMS,
            markdown=text,
            normalized_text=normalize_legal_markdown(text),
            content_hash=legal_content_hash(text),
        )
        return LegalCorpus(pages=[page], combined=text, corpus_hash=page.content_hash)

    @patch("pyworker.tasks.tos_review.create_legal_revision")
    @patch("pyworker.tasks.tos_review.upsert_legal_document", return_value=7)
    @patch("pyworker.tasks.tos_review.get_legal_documents", return_value={})
    def test_first_crawl_stores_without_recording_a_change(
        self, mock_docs: MagicMock, mock_upsert: MagicMock, mock_revision: MagicMock
    ):
        self.task.record_document_changes(1, self._corpus("We may block funds."))

        mock_upsert.assert_called_once()
        self.assertFalse(mock_upsert.call_args.kwargs["changed"])
        mock_revision.assert_not_called()

    @patch("pyworker.tasks.tos_review.create_legal_revision")
    @patch("pyworker.tasks.tos_review.upsert_legal_document", return_value=7)
    @patch("pyworker.tasks.tos_review.get_legal_documents")
    def test_cosmetic_republish_records_nothing(
        self, mock_docs: MagicMock, mock_upsert: MagicMock, mock_revision: MagicMock
    ):
        mock_docs.return_value = {
            "x.com/terms": {
                "id": 7,
                "urlKey": "x.com/terms",
                "contentHash": "irrelevant",
                "normalizedText": f"We may block funds.\n{TestRecordDocumentChanges.FILLER}",
            }
        }
        self.task.record_document_changes(
            1, self._corpus("Last updated: 4 June 2026\nWe  may block funds.")
        )

        self.assertFalse(mock_upsert.call_args.kwargs["changed"])
        mock_revision.assert_not_called()

    @patch("pyworker.tasks.tos_review.prompt_legal_change_summary", return_value="Adds an identity check before withdrawal.")
    @patch("pyworker.tasks.tos_review.create_legal_revision")
    @patch("pyworker.tasks.tos_review.upsert_legal_document", return_value=7)
    @patch("pyworker.tasks.tos_review.get_legal_documents")
    def test_new_clause_is_recorded_as_material(
        self,
        mock_docs: MagicMock,
        mock_upsert: MagicMock,
        mock_revision: MagicMock,
        mock_summary: MagicMock,
    ):
        mock_docs.return_value = {
            "x.com/terms": {
                "id": 7,
                "urlKey": "x.com/terms",
                "contentHash": "irrelevant",
                "normalizedText": f"We do not collect personal data.\n{TestRecordDocumentChanges.FILLER}",
            }
        }
        self.task.record_document_changes(
            1,
            self._corpus(
                "We require government issued identification before any withdrawal is processed."
            ),
        )

        self.assertTrue(mock_upsert.call_args.kwargs["changed"])
        mock_revision.assert_called_once()
        self.assertEqual(mock_revision.call_args.kwargs["change_level"], "MATERIAL")
        self.assertEqual(
            mock_revision.call_args.kwargs["summary"], "Adds an identity check before withdrawal."
        )

    @patch("pyworker.tasks.tos_review.prompt_legal_change_summary")
    def test_minor_changes_are_not_summarized(self, mock_summary: MagicMock):
        summary = self.task.summarize_change(LegalChangeLevel.MINOR, "@@ -1 +1 @@", "Svc", "TERMS")

        self.assertIsNone(summary)
        mock_summary.assert_not_called()

    @patch("pyworker.tasks.tos_review.prompt_legal_change_summary", side_effect=RuntimeError("model down"))
    def test_a_failed_summary_does_not_lose_the_revision(self, mock_summary: MagicMock):
        summary = self.task.summarize_change(LegalChangeLevel.MATERIAL, "@@ -1 +1 @@", "Svc", "TERMS")

        self.assertIsNone(summary)


class TestRecordRemovedDocuments(unittest.TestCase):
    """A page that stops being published is an edit, but an outage is not."""

    def setUp(self):
        self.task = TosReviewTask()
        self.stored = {
            "x.com/terms": {"id": 7, "urlKey": "x.com/terms", "normalizedText": "We may block funds."}
        }

    @staticmethod
    def _corpus(url_key: str) -> LegalCorpus:
        page = LegalPage(
            url_key=url_key,
            url=f"https://{url_key}",
            kind=LegalDocumentKind.TERMS,
            markdown="body",
            normalized_text="body",
            content_hash="h",
        )
        return LegalCorpus(pages=[page], combined="body", corpus_hash="h")

    @patch("pyworker.tasks.tos_review.create_legal_revision")
    def test_a_withdrawn_document_is_recorded(self, mock_revision: MagicMock):
        self.task.record_removed_documents(1, self._corpus("x.com/privacy"), self.stored)

        mock_revision.assert_called_once()
        self.assertEqual(mock_revision.call_args.kwargs["change_level"], "MATERIAL")

    @patch("pyworker.tasks.tos_review.create_legal_revision")
    def test_a_still_published_document_is_not_recorded(self, mock_revision: MagicMock):
        self.task.record_removed_documents(1, self._corpus("x.com/terms"), self.stored)

        mock_revision.assert_not_called()

    @patch("pyworker.tasks.tos_review.create_legal_revision")
    def test_an_empty_crawl_is_treated_as_an_outage(self, mock_revision: MagicMock):
        empty = LegalCorpus(pages=[], combined="", corpus_hash="")
        self.task.record_removed_documents(1, empty, self.stored)

        mock_revision.assert_not_called()


class TestUnusablePagesAreNotStored(unittest.TestCase):
    """A challenge page must leave the previous baseline untouched."""

    def setUp(self):
        self.task = TosReviewTask()

    @patch("pyworker.tasks.tos_review.create_legal_revision")
    @patch("pyworker.tasks.tos_review.upsert_legal_document", return_value=1)
    @patch("pyworker.tasks.tos_review.get_legal_documents", return_value={})
    def test_a_blocked_fetch_is_skipped(
        self, mock_docs: MagicMock, mock_upsert: MagicMock, mock_revision: MagicMock
    ):
        blocked = "Just a moment... checking your browser."
        page = LegalPage(
            url_key="x.com/terms",
            url="https://x.com/terms",
            kind=LegalDocumentKind.TERMS,
            markdown=blocked,
            normalized_text=blocked,
            content_hash="h",
        )
        self.task.record_document_changes(1, LegalCorpus([page], blocked, "h"))

        mock_upsert.assert_not_called()
        mock_revision.assert_not_called()
