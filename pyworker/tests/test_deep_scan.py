"""Tests for the DeepScanTask helpers and integration."""

import unittest
from typing import Any, Dict, List, cast
from unittest.mock import MagicMock, patch

from pyworker.database import save_deep_scan_proposed_edits
from pyworker.tasks.deep_scan import DeepScanTask, _format_attribute_catalog
from pyworker.utils.crawl import LegalCorpus, LegalPage
from pyworker.utils.legal_text import LegalDocumentKind


SAMPLE_LLM_RESULT: Dict[str, Any] = {
    "kycLevel": 3,
    "summary": "Service may demand KYC at any time.",
    "complexity": "medium",
    "highlights": [
        {
            "title": "Shotgun KYC",
            "content": "May demand verification on flagged transactions.",
            "rating": "negative",
        }
    ],
    "kycPolicyNotesMd": "Triggered on automated risk flags.",
    "kycLevelRationale": "Clauses describe non-mandatory KYC triggered by transaction flags.",
    "attributesToAdd": [
        {"attributeId": 12, "rationale": "Document mentions KYC trigger."},
        {"attributeId": 99, "rationale": "Not in catalog, must be dropped."},
        {"attributeId": 7, "rationale": "Already assigned, must be dropped."},
    ],
    "attributesToRemove": [
        {"attributeId": 5, "rationale": "Not assigned, must be dropped."},
        {"attributeId": 7, "rationale": "Currently assigned and contradicted."},
    ],
    "warnings": [
        {"title": "Funds may be frozen", "bodyMd": "Per ToS clause X.", "severity": "alert"}
    ],
}


def make_catalog(*ids: int) -> List[Dict[str, Any]]:
    return [
        {
            "id": i,
            "slug": f"attr-{i}",
            "title": f"Attribute {i}",
            "description": f"Desc {i}",
            "category": "PRIVACY",
            "type": "BAD",
        }
        for i in ids
    ]


class FakeCursor:
    def __init__(self):
        self.executed: List[tuple[str, Any]] = []
        self._fetchone_results = [{"id": 999}]
        self._fetchall_results = [[{"id": 100}, {"id": 101}]]

    def __enter__(self):
        return self

    def __exit__(self, *_args: Any):
        return None

    def execute(self, query: str, params: Any = None):
        self.executed.append((query, params))

    def fetchone(self):
        return self._fetchone_results.pop(0)

    def fetchall(self):
        return self._fetchall_results.pop(0)


class FakeConnection:
    def __init__(self):
        self.cursor_instance = FakeCursor()
        self.commits = 0

    def __enter__(self):
        return self

    def __exit__(self, *_args: Any):
        return None

    def cursor(self, **_kwargs: Any):
        return self.cursor_instance

    def commit(self):
        self.commits += 1


class TestFormatAttributeCatalog(unittest.TestCase):
    def test_groups_by_category_and_renders_ids(self):
        catalog = [
            {
                "id": 1,
                "slug": "a",
                "title": "Foo",
                "description": "First",
                "category": "PRIVACY",
                "type": "BAD",
            },
            {
                "id": 2,
                "slug": "b",
                "title": "Bar",
                "description": "",
                "category": "TRUST",
                "type": "GOOD",
            },
        ]
        rendered = _format_attribute_catalog(catalog)
        self.assertIn("### PRIVACY", rendered)
        self.assertIn("### TRUST", rendered)
        self.assertIn("id=1", rendered)
        self.assertIn("id=2", rendered)
        self.assertIn("Foo", rendered)
        # Empty descriptions must not produce a trailing " - " marker
        self.assertNotIn('title="Bar" -', rendered)


class TestBuildProposedEdits(unittest.TestCase):
    def test_drops_unknown_and_inconsistent_attribute_proposals(self):
        task = DeepScanTask()
        catalog_ids = {7, 12}
        current_ids = [7]
        proposed = task._build_proposed_edits(
            result=cast(Any, SAMPLE_LLM_RESULT),
            corpus_hash="0" * 64,
            current_attribute_ids=current_ids,
            catalog_ids=catalog_ids,
        )

        add_ids = [a["attributeId"] for a in proposed["attributes"]["add"]]
        remove_ids = [a["attributeId"] for a in proposed["attributes"]["remove"]]

        # Add: 12 ok; 99 not in catalog -> drop; 7 already assigned -> drop.
        self.assertEqual(add_ids, [12])
        # Remove: 5 not assigned -> drop; 7 assigned + in catalog -> keep.
        self.assertEqual(remove_ids, [7])

    def test_preserves_other_sections_verbatim(self):
        task = DeepScanTask()
        proposed = task._build_proposed_edits(
            result=cast(Any, SAMPLE_LLM_RESULT),
            corpus_hash="abc",
            current_attribute_ids=[],
            catalog_ids={12},
        )
        self.assertEqual(proposed["contentHash"], "abc")
        self.assertEqual(proposed["tosReview"]["kycLevel"], 3)
        self.assertEqual(proposed["kycPolicy"]["inferredLevel"], 3)
        self.assertEqual(proposed["kycPolicy"]["notesMd"], "Triggered on automated risk flags.")
        self.assertEqual(len(proposed["warnings"]), 1)


class TestSaveDeepScanProposedEdits(unittest.TestCase):
    @patch("pyworker.database.ensure_bot_user", return_value=321)
    @patch("pyworker.database.get_db_connection")
    def test_withdraws_older_actionable_deep_scan_suggestions(
        self,
        mock_connection: MagicMock,
        _mock_bot_user: MagicMock,
    ):
        connection = FakeConnection()
        mock_connection.return_value = connection

        suggestion_id = save_deep_scan_proposed_edits(
            service_id=42,
            proposed_edits={"contentHash": "abc"},
            summary_notes="summary",
        )

        self.assertEqual(suggestion_id, 999)
        self.assertEqual(connection.commits, 1)

        executed = connection.cursor_instance.executed
        self.assertEqual(len(executed), 2)

        insert_query, insert_params = executed[0]
        self.assertIn('INSERT INTO "ServiceSuggestion"', insert_query)
        self.assertEqual(insert_params[0], "summary")
        self.assertEqual(insert_params[2:], (321, 42))

        withdraw_query, withdraw_params = executed[1]
        self.assertIn("status = 'WITHDRAWN'", withdraw_query)
        self.assertIn("status IN ('PENDING', 'UNDER_REVIEW')", withdraw_query)
        self.assertIn('"proposedEdits" IS NOT NULL', withdraw_query)
        self.assertEqual(withdraw_params[2:], (42, 999))


class TestDeepScanTaskRun(unittest.TestCase):
    def setUp(self):
        self.task = DeepScanTask()

    @patch("pyworker.tasks.deep_scan.fetch_service_for_deep_scan")
    def test_returns_none_when_service_missing(self, mock_fetch: MagicMock):
        mock_fetch.return_value = None
        self.assertIsNone(self.task.run(123))

    @patch("pyworker.tasks.deep_scan.fetch_service_for_deep_scan")
    def test_returns_none_when_no_tos_urls(self, mock_fetch: MagicMock):
        mock_fetch.return_value = {
            "id": 1,
            "name": "S",
            "kycLevel": 0,
            "tosUrls": [],
        }
        self.assertIsNone(self.task.run(1))

    @patch("pyworker.tasks.deep_scan.save_deep_scan_proposed_edits")
    @patch("pyworker.tasks.deep_scan.prompt_deep_scan")
    @patch("pyworker.tasks.deep_scan.prompt_check_tos_review")
    @patch("pyworker.tasks.deep_scan.fetch_service_attributes")
    @patch("pyworker.tasks.deep_scan.fetch_attribute_catalog")
    @patch("pyworker.tasks.deep_scan.fetch_legal_corpus")
    @patch("pyworker.tasks.deep_scan.fetch_service_for_deep_scan")
    def test_happy_path_writes_review_proposal(
        self,
        mock_service: MagicMock,
        mock_corpus: MagicMock,
        mock_catalog: MagicMock,
        mock_attrs: MagicMock,
        mock_check: MagicMock,
        mock_scan: MagicMock,
        mock_save_edits: MagicMock,
    ):
        mock_service.return_value = {
            "id": 42,
            "name": "ChangeHero",
            "kycLevel": 1,
            "tosUrls": ["https://example.com/tos"],
        }
        mock_corpus.return_value = LegalCorpus(
            pages=[
                LegalPage(
                    url_key="a",
                    url="https://a",
                    kind=LegalDocumentKind.TERMS,
                    markdown="body",
                    normalized_text="body",
                    content_hash="hash",
                )
            ],
            combined="===== PAGE: a =====\nbody\n===== END PAGE =====",
            corpus_hash="hash",
        )
        mock_catalog.return_value = make_catalog(7, 12)
        mock_attrs.return_value = [{"id": 7}]
        mock_check.return_value = {"isComplete": True}
        mock_scan.return_value = SAMPLE_LLM_RESULT
        mock_save_edits.return_value = 999

        suggestion_id = self.task.run(42)
        self.assertEqual(suggestion_id, 999)

        # save_deep_scan_proposed_edits gets the full payload.
        edits_call = mock_save_edits.call_args.kwargs
        self.assertEqual(edits_call["service_id"], 42)
        self.assertIn("kycPolicy", edits_call["proposed_edits"])
        self.assertIn("attributes", edits_call["proposed_edits"])
        self.assertIn("warnings", edits_call["proposed_edits"])
        self.assertIn("KYC level: 1 -> 3", edits_call["summary_notes"])


if __name__ == "__main__":
    unittest.main()