"""
Tests for pyworker.utils.legal_changes
"""

import unittest
from unittest.mock import MagicMock, patch

from pyworker.utils.legal_crawl import LegalCorpus, LegalPage
from pyworker.utils.legal_changes import (
    record_document_changes,
    record_removed_documents,
    summarize_change,
)
from pyworker.utils.legal_text import LegalChangeLevel, LegalDocumentKind


class TestRecordDocumentChanges(unittest.TestCase):
    """The change log must record real edits and ignore republish noise."""

    FILLER = "\n".join(f"Clause {i} is unchanged boilerplate text." for i in range(30))

    @classmethod
    def _corpus(cls, text: str) -> LegalCorpus:
        from pyworker.utils.legal_text import (
            legal_content_hash,
            normalize_legal_markdown,
        )

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

    @patch("pyworker.utils.legal_changes.create_legal_revision")
    @patch("pyworker.utils.legal_changes.upsert_legal_document", return_value=7)
    @patch("pyworker.utils.legal_changes.get_legal_documents", return_value={})
    def test_first_crawl_stores_without_recording_a_change(
        self, mock_docs: MagicMock, mock_upsert: MagicMock, mock_revision: MagicMock
    ):
        record_document_changes(1, self._corpus("We may block funds."))

        mock_upsert.assert_called_once()
        self.assertFalse(mock_upsert.call_args.kwargs["changed"])
        mock_revision.assert_not_called()

    @patch("pyworker.utils.legal_changes.create_legal_revision")
    @patch("pyworker.utils.legal_changes.upsert_legal_document", return_value=7)
    @patch("pyworker.utils.legal_changes.get_legal_documents")
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
        record_document_changes(
            1, self._corpus("Last updated: 4 June 2026\nWe  may block funds.")
        )

        self.assertFalse(mock_upsert.call_args.kwargs["changed"])
        mock_revision.assert_not_called()

    @patch(
        "pyworker.utils.legal_changes.prompt_legal_change_summary",
        return_value="Adds an identity check before withdrawal.",
    )
    @patch("pyworker.utils.legal_changes.create_legal_revision")
    @patch("pyworker.utils.legal_changes.upsert_legal_document", return_value=7)
    @patch("pyworker.utils.legal_changes.get_legal_documents")
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
        record_document_changes(
            1,
            self._corpus(
                "We require government issued identification before any withdrawal is processed."
            ),
        )

        self.assertTrue(mock_upsert.call_args.kwargs["changed"])
        mock_revision.assert_called_once()
        self.assertEqual(mock_revision.call_args.kwargs["change_level"], "MATERIAL")
        self.assertEqual(
            mock_revision.call_args.kwargs["summary"],
            "Adds an identity check before withdrawal.",
        )

    @patch("pyworker.utils.legal_changes.prompt_legal_change_summary")
    def test_minor_changes_are_not_summarized(self, mock_summary: MagicMock):
        summary = summarize_change(
            LegalChangeLevel.MINOR, "@@ -1 +1 @@", "Svc", "TERMS"
        )

        self.assertIsNone(summary)
        mock_summary.assert_not_called()

    @patch(
        "pyworker.utils.legal_changes.prompt_legal_change_summary",
        side_effect=RuntimeError("model down"),
    )
    def test_a_failed_summary_does_not_lose_the_revision(self, mock_summary: MagicMock):
        summary = summarize_change(
            LegalChangeLevel.MATERIAL, "@@ -1 +1 @@", "Svc", "TERMS"
        )

        self.assertIsNone(summary)


class TestRecordRemovedDocuments(unittest.TestCase):
    """Only a gone answer is removal. Being blocked or unlinked is not."""

    def setUp(self):
        self.stored = {
            "x.com/terms": {
                "id": 7,
                "url": "https://x.com/terms",
                "normalizedText": "We may block funds.",
                "removedAt": None,
            }
        }

    @staticmethod
    def _corpus(
        statuses: dict[str, int], pages: list[str] = (), readable: bool = True
    ) -> LegalCorpus:
        # Long enough to pass is_usable_legal_page unless a test asks otherwise,
        # since a page the crawler could not read proves nothing either way.
        text = "these terms of service govern your use of the site " * 20
        crawled = [
            LegalPage(
                url_key=key,
                url=f"https://{key}",
                kind=LegalDocumentKind.TERMS,
                markdown="body",
                normalized_text=text if readable else "body",
                content_hash="h",
            )
            for key in pages
        ]
        return LegalCorpus(
            pages=crawled, combined="body", corpus_hash="h", statuses=statuses
        )

    @patch("pyworker.utils.legal_changes.mark_legal_document_removed")
    @patch("pyworker.utils.legal_changes.create_legal_revision")
    def test_a_deleted_document_is_recorded_once(
        self, mock_revision: MagicMock, mock_mark: MagicMock
    ):
        record_removed_documents(1, self._corpus({"x.com/terms": 404}), self.stored)

        mock_revision.assert_called_once()
        self.assertEqual(mock_revision.call_args.kwargs["change_level"], "MATERIAL")
        mock_mark.assert_called_once_with(7)

    @patch("pyworker.utils.legal_changes.mark_legal_document_removed")
    @patch("pyworker.utils.legal_changes.create_legal_revision")
    def test_an_already_recorded_removal_does_not_repeat(
        self, mock_revision: MagicMock, mock_mark: MagicMock
    ):
        self.stored["x.com/terms"]["removedAt"] = "2026-08-01"

        record_removed_documents(1, self._corpus({"x.com/terms": 404}), self.stored)

        mock_revision.assert_not_called()
        mock_mark.assert_not_called()

    @patch("pyworker.utils.legal_changes.mark_legal_document_unreachable")
    @patch("pyworker.utils.legal_changes.create_legal_revision")
    def test_a_service_that_starts_blocking_the_crawler_is_not_a_removal(
        self, mock_revision: MagicMock, mock_unreachable: MagicMock
    ):
        # Cloudflare turned on: the crawl yields nothing for the page, which
        # says nothing about whether the service still publishes it.
        record_removed_documents(1, self._corpus({}), self.stored)

        mock_revision.assert_not_called()
        mock_unreachable.assert_called_once_with(7)

    @patch("pyworker.utils.legal_changes.mark_legal_document_unreachable")
    @patch("pyworker.utils.legal_changes.create_legal_revision")
    def test_a_page_that_stopped_being_linked_is_not_a_removal(
        self, mock_revision: MagicMock, mock_unreachable: MagicMock
    ):
        record_removed_documents(
            1, self._corpus({"x.com/privacy": 200}, ["x.com/privacy"]), self.stored
        )

        mock_revision.assert_not_called()

    @patch("pyworker.utils.legal_changes.create_legal_revision")
    def test_a_still_published_document_is_not_recorded(self, mock_revision: MagicMock):
        record_removed_documents(
            1, self._corpus({"x.com/terms": 200}, ["x.com/terms"]), self.stored
        )

        mock_revision.assert_not_called()

    @patch("pyworker.utils.legal_changes.clear_legal_document_removal")
    @patch("pyworker.utils.legal_changes.create_legal_revision")
    def test_a_document_that_comes_back_is_recorded_once(
        self, mock_revision: MagicMock, mock_clear: MagicMock
    ):
        self.stored["x.com/terms"]["removedAt"] = "2026-08-01"

        record_removed_documents(
            1, self._corpus({"x.com/terms": 200}, ["x.com/terms"]), self.stored
        )

        mock_revision.assert_called_once()
        self.assertIn("published again", mock_revision.call_args.kwargs["summary"])
        mock_clear.assert_called_once_with(7)

    @patch("pyworker.utils.legal_changes.mark_legal_document_unreachable")
    @patch("pyworker.utils.legal_changes.clear_legal_document_removal")
    @patch("pyworker.utils.legal_changes.create_legal_revision")
    def test_a_block_does_not_restore_a_removed_document(
        self,
        mock_revision: MagicMock,
        mock_clear: MagicMock,
        mock_unreachable: MagicMock,
    ):
        # 403 is the crawler being told nothing. Announcing a restore on it means
        # the next 404 announces the removal again, and a service that alternates
        # the two publishes a change every night while its terms sit still.
        self.stored["x.com/terms"]["removedAt"] = "2026-08-01"

        record_removed_documents(1, self._corpus({"x.com/terms": 403}), self.stored)

        mock_revision.assert_not_called()
        mock_clear.assert_not_called()
        mock_unreachable.assert_called_once_with(7)

    @patch("pyworker.utils.legal_changes.mark_legal_document_unreachable")
    @patch("pyworker.utils.legal_changes.clear_legal_document_removal")
    @patch("pyworker.utils.legal_changes.create_legal_revision")
    def test_a_challenge_page_does_not_restore_a_removed_document(
        self,
        mock_revision: MagicMock,
        mock_clear: MagicMock,
        mock_unreachable: MagicMock,
    ):
        # A 200 carrying an interstitial is the same silence with a better status.
        self.stored["x.com/terms"]["removedAt"] = "2026-08-01"

        record_removed_documents(
            1,
            self._corpus({"x.com/terms": 200}, ["x.com/terms"], readable=False),
            self.stored,
        )

        mock_revision.assert_not_called()
        mock_clear.assert_not_called()
        mock_unreachable.assert_called_once_with(7)

    @patch("pyworker.utils.legal_changes.create_legal_revision")
    def test_a_server_error_is_not_a_removal(self, mock_revision: MagicMock):
        record_removed_documents(1, self._corpus({"x.com/terms": 503}), self.stored)

        mock_revision.assert_not_called()


class TestUnusablePagesAreNotStored(unittest.TestCase):
    """A challenge page must leave the previous baseline untouched."""

    @patch("pyworker.utils.legal_changes.create_legal_revision")
    @patch("pyworker.utils.legal_changes.upsert_legal_document", return_value=1)
    @patch("pyworker.utils.legal_changes.get_legal_documents", return_value={})
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
        record_document_changes(1, LegalCorpus([page], blocked, "h"))

        mock_upsert.assert_not_called()
        mock_revision.assert_not_called()
