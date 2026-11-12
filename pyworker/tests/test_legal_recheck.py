"""
Tests for the daily legal document recheck, from the worker loop down.
"""

import os
import unittest
from unittest.mock import MagicMock, patch

from pyworker import cli
from pyworker.scheduler import TaskScheduler
from pyworker.utils.legal_changes import recheck_service_documents
from pyworker.utils.legal_crawl import LegalCorpus, LegalPage
from pyworker.utils.legal_text import (
    LegalDocumentKind,
    legal_content_hash,
    normalize_legal_markdown,
)

FILLER = "\n".join(f"Clause {i} is unchanged boilerplate text." for i in range(30))


def _corpus(text: str) -> LegalCorpus:
    text = f"{text}\n{FILLER}"
    page = LegalPage(
        url_key="x.com/terms",
        url="https://x.com/terms",
        kind=LegalDocumentKind.TERMS,
        markdown=text,
        normalized_text=normalize_legal_markdown(text),
        content_hash=legal_content_hash(text),
    )
    return LegalCorpus(pages=[page], combined=text, corpus_hash=page.content_hash)


def _gone() -> LegalCorpus:
    return LegalCorpus(
        pages=[], combined="", corpus_hash="", statuses={"x.com/terms": 404}
    )


def _stored(text: str, **extra: object) -> dict[str, dict[str, object]]:
    return {
        "x.com/terms": {
            "id": 7,
            "urlKey": "x.com/terms",
            "url": "https://x.com/terms",
            "normalizedText": normalize_legal_markdown(f"{text}\n{FILLER}"),
            **extra,
        }
    }


class TestRecheckService(unittest.TestCase):
    def setUp(self):
        patcher = patch("pyworker.utils.legal_changes.time.sleep")
        patcher.start()
        self.addCleanup(patcher.stop)

    @patch("pyworker.utils.legal_changes.create_legal_revision")
    @patch("pyworker.utils.legal_changes.upsert_legal_document", return_value=7)
    @patch("pyworker.utils.legal_changes.get_legal_documents")
    @patch("pyworker.utils.legal_changes.fetch_legal_corpus")
    def test_edited_terms_record_a_revision_without_a_model_scan(
        self,
        mock_fetch: MagicMock,
        mock_docs: MagicMock,
        mock_upsert: MagicMock,
        mock_revision: MagicMock,
    ):
        mock_docs.return_value = _stored("Withdrawals are instant.")
        mock_fetch.return_value = _corpus(
            "Withdrawals are instant. We may freeze funds pending an identity check."
        )

        with patch(
            "pyworker.utils.legal_changes.prompt_legal_change_summary",
            return_value="Adds an identity check.",
        ):
            recheck_service_documents(1, ["https://x.com/terms"], "X")

        self.assertEqual(mock_fetch.call_count, 2)
        mock_fetch.assert_called_with(
            ["https://x.com/terms"], known_urls=["https://x.com/terms"]
        )
        self.assertTrue(mock_upsert.call_args.kwargs["changed"])
        mock_revision.assert_called_once()

    @patch("pyworker.utils.legal_changes.create_legal_revision")
    @patch("pyworker.utils.legal_changes.upsert_legal_document", return_value=7)
    @patch("pyworker.utils.legal_changes.get_legal_documents")
    @patch("pyworker.utils.legal_changes.fetch_legal_corpus")
    def test_a_difference_the_second_fetch_does_not_repeat_is_noise(
        self,
        mock_fetch: MagicMock,
        mock_docs: MagicMock,
        mock_upsert: MagicMock,
        mock_revision: MagicMock,
    ):
        mock_docs.return_value = _stored("Withdrawals are instant.")
        mock_fetch.side_effect = [
            _corpus(
                "Withdrawals are instant. Rotating banner: offer A and more words."
            ),
            _corpus(
                "Withdrawals are instant. Rotating banner: offer B and more words."
            ),
        ]

        recheck_service_documents(1, ["https://x.com/terms"], "X")

        self.assertFalse(mock_upsert.call_args.kwargs["changed"])
        mock_revision.assert_not_called()

    @patch("pyworker.utils.legal_changes.create_legal_revision")
    @patch("pyworker.utils.legal_changes.upsert_legal_document", return_value=7)
    @patch("pyworker.utils.legal_changes.get_legal_documents")
    @patch("pyworker.utils.legal_changes.fetch_legal_corpus")
    def test_an_unchanged_page_is_fetched_once(
        self,
        mock_fetch: MagicMock,
        mock_docs: MagicMock,
        mock_upsert: MagicMock,
        mock_revision: MagicMock,
    ):
        mock_docs.return_value = _stored("Withdrawals are instant.")
        mock_fetch.return_value = _corpus("Withdrawals are instant.")

        recheck_service_documents(1, ["https://x.com/terms"], "X")

        mock_fetch.assert_called_once()
        mock_revision.assert_not_called()

    @patch("pyworker.utils.legal_changes.create_legal_revision")
    @patch("pyworker.utils.legal_changes.upsert_legal_document", return_value=7)
    @patch("pyworker.utils.legal_changes.get_legal_documents")
    @patch("pyworker.utils.legal_changes.fetch_legal_corpus")
    def test_page_unreachable_once_then_unchanged_records_nothing(
        self,
        mock_fetch: MagicMock,
        mock_docs: MagicMock,
        mock_upsert: MagicMock,
        mock_revision: MagicMock,
    ):
        mock_docs.return_value = _stored(
            "Withdrawals are instant.", unreachableAt="2026-10-28T01:00:00Z"
        )
        mock_fetch.return_value = _corpus("Withdrawals are instant.")

        recheck_service_documents(1, ["https://x.com/terms"], "X")

        self.assertFalse(mock_upsert.call_args.kwargs["changed"])
        mock_revision.assert_not_called()

    @patch("pyworker.utils.legal_changes.create_legal_revision")
    @patch("pyworker.utils.legal_changes.upsert_legal_document", return_value=7)
    @patch("pyworker.utils.legal_changes.get_legal_documents")
    @patch("pyworker.utils.legal_changes.fetch_legal_corpus")
    def test_an_edit_repeated_under_rotating_noise_is_confirmed(
        self,
        mock_fetch: MagicMock,
        mock_docs: MagicMock,
        mock_upsert: MagicMock,
        mock_revision: MagicMock,
    ):
        mock_docs.return_value = _stored("Withdrawals are instant.")
        edit = (
            "Withdrawals are instant.\nWe may freeze funds pending an identity check."
        )
        mock_fetch.side_effect = [
            _corpus(f"{edit}\nRotating banner: offer A and more words."),
            _corpus(f"{edit}\nRotating banner: offer B and more words."),
        ]

        with patch(
            "pyworker.utils.legal_changes.prompt_legal_change_summary",
            return_value="Adds an identity check.",
        ):
            recheck_service_documents(1, ["https://x.com/terms"], "X")

        self.assertTrue(mock_upsert.call_args.kwargs["changed"])
        mock_revision.assert_called_once()

    @patch("pyworker.utils.legal_changes.mark_legal_document_unreachable")
    @patch("pyworker.utils.legal_changes.mark_legal_document_removed")
    @patch("pyworker.utils.legal_changes.create_legal_revision")
    @patch("pyworker.utils.legal_changes.get_legal_documents")
    @patch("pyworker.utils.legal_changes.fetch_legal_corpus")
    def test_a_single_not_found_is_not_published_as_a_removal(
        self,
        mock_fetch: MagicMock,
        mock_docs: MagicMock,
        mock_revision: MagicMock,
        mock_removed: MagicMock,
        mock_unreachable: MagicMock,
    ):
        mock_docs.return_value = _stored("Withdrawals are instant.")
        mock_fetch.side_effect = [_gone(), _corpus("Withdrawals are instant.")]

        recheck_service_documents(1, ["https://x.com/terms"], "X")

        self.assertEqual(mock_fetch.call_count, 2)
        mock_removed.assert_not_called()
        mock_revision.assert_not_called()
        mock_unreachable.assert_called_once_with(7)

    @patch("pyworker.utils.legal_changes.mark_legal_document_removed")
    @patch("pyworker.utils.legal_changes.create_legal_revision")
    @patch("pyworker.utils.legal_changes.get_legal_documents")
    @patch("pyworker.utils.legal_changes.fetch_legal_corpus")
    def test_a_not_found_seen_twice_is_a_removal(
        self,
        mock_fetch: MagicMock,
        mock_docs: MagicMock,
        mock_revision: MagicMock,
        mock_removed: MagicMock,
    ):
        mock_docs.return_value = _stored("Withdrawals are instant.")
        mock_fetch.side_effect = [_gone(), _gone()]

        recheck_service_documents(1, ["https://x.com/terms"], "X")

        mock_removed.assert_called_once_with(7)


class TestRecheckWorkerLoop(unittest.TestCase):
    """Drives run_worker_mode with the cron variable, as the container does."""

    def _run_worker_once(self) -> None:
        def start_and_tick(scheduler: TaskScheduler) -> None:
            for info in scheduler.tasks.values():
                info["func"](*info["args"], **info["kwargs"])

        environ = {"CRON_LEGAL_RECHECK_TASK": "0 1 * * *"}
        with (
            patch.dict(os.environ, environ, clear=True),
            patch.object(TaskScheduler, "start", start_and_tick),
            patch.object(TaskScheduler, "is_running", return_value=False),
            patch.object(TaskScheduler, "stop"),
        ):
            self.assertEqual(cli.run_worker_mode(), 0)

    @patch("pyworker.cli.time.sleep")
    @patch("pyworker.cli.recheck_service_documents")
    @patch("pyworker.cli.fetch_services_with_legal_documents")
    def test_cron_variable_rechecks_every_service_and_survives_a_failure(
        self,
        mock_services: MagicMock,
        mock_recheck: MagicMock,
        mock_sleep: MagicMock,
    ):
        mock_services.return_value = [
            {"id": 1, "name": "A", "tosUrls": ["https://a.example/terms"]},
            {"id": 2, "name": "B", "tosUrls": ["https://b.example/terms"]},
            {"id": 3, "name": "C", "tosUrls": ["https://c.example/terms"]},
        ]
        mock_recheck.side_effect = [None, RuntimeError("crawler down"), None]

        self._run_worker_once()

        self.assertEqual(
            [call.args[0] for call in mock_recheck.call_args_list], [1, 2, 3]
        )
        self.assertEqual(mock_sleep.call_count, 2)

    @patch("pyworker.cli.close_db_pool")
    @patch("pyworker.cli.time.sleep")
    @patch("pyworker.cli.recheck_service_documents")
    @patch("pyworker.cli.fetch_services_with_legal_documents", return_value=[])
    def test_command_line_entry_point_runs_the_task(
        self,
        mock_services: MagicMock,
        mock_recheck: MagicMock,
        mock_sleep: MagicMock,
        mock_close: MagicMock,
    ):
        with patch("sys.argv", ["pyworker", "legal-recheck"]):
            self.assertEqual(cli.main(), 0)

        mock_services.assert_called_once_with()
        mock_recheck.assert_not_called()
        mock_close.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
