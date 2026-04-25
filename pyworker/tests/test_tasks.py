"""
Tests for task modules.
"""

import unittest
from unittest.mock import patch, MagicMock
from typing import Dict, Any

from pyworker.tasks import TosReviewTask


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

    @patch("pyworker.tasks.tos_review.save_tos_review")
    @patch("pyworker.tasks.tos_review.fetch_legal_corpus")
    def test_run_skips_when_corpus_unchanged(
        self, mock_corpus: MagicMock, mock_save: MagicMock
    ):
        corpus_hash = "a" * 64
        mock_corpus.return_value = ("===== PAGE: x =====\nbody\n===== END PAGE =====", ["x"], corpus_hash)
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
