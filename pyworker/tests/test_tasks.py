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
    @patch("pyworker.tasks.tos_review.fetch_markdown")
    def test_run_skips_when_content_unchanged(
        self, mock_fetch: MagicMock, mock_save: MagicMock
    ):
        import hashlib

        content = "same tos content"
        content_hash = hashlib.sha256(content.encode()).hexdigest()

        mock_fetch.return_value = content
        service: Dict[str, Any] = {
            "id": 3,
            "name": "Test Service",
            "verificationStatus": "APPROVED",
            "tosUrls": ["https://example.com/tos"],
            "tosReview": {"contentHash": content_hash},
        }

        self.task.run(service)
        # Content hash matches — should save with existing review (no AI call)
        mock_save.assert_called_once_with(3, {"contentHash": content_hash})


if __name__ == "__main__":
    unittest.main()
