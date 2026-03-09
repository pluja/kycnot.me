"""
Tests for pyworker.utils.crawl
"""

import unittest
from unittest.mock import MagicMock, patch

import requests


class TestExtractMarkdown(unittest.TestCase):
    """Unit tests for _extract_markdown — no I/O involved."""

    def setUp(self):
        from pyworker.utils.crawl import _extract_markdown
        self.extract = _extract_markdown

    def test_fit_markdown_preferred(self):
        self.assertEqual(self.extract({"markdown": {"fit_markdown": "clean", "raw_markdown": "raw"}}), "clean")

    def test_raw_markdown_fallback_when_fit_empty(self):
        self.assertEqual(self.extract({"markdown": {"fit_markdown": "", "raw_markdown": "raw"}}), "raw")

    def test_plain_string_markdown(self):
        self.assertEqual(self.extract({"markdown": "plain"}), "plain")

    def test_missing_markdown_key(self):
        self.assertEqual(self.extract({}), "")


class TestFetchCrawl4AI(unittest.TestCase):
    """Unit tests for _fetch_crawl4ai with mocked HTTP."""

    def _make_response(self, success: bool = True, markdown: str = "# content") -> MagicMock:
        r = MagicMock()
        r.json.return_value = {
            "results": [{"success": success, "markdown": {"fit_markdown": markdown, "raw_markdown": markdown}, "error_message": ""}]
        }
        return r

    @patch("pyworker.utils.crawl.requests.post")
    def test_returns_markdown_on_success(self, mock_post: MagicMock):
        mock_post.return_value = self._make_response(markdown="# ToS")

        from pyworker.utils.crawl import _fetch_crawl4ai
        result = _fetch_crawl4ai("https://example.com/tos")

        self.assertEqual(result, "# ToS")
        call_url = mock_post.call_args[0][0]
        self.assertIn("/crawl", call_url)

    @patch("pyworker.utils.crawl.requests.post")
    def test_uses_stealth_and_networkidle(self, mock_post: MagicMock):
        mock_post.return_value = self._make_response()

        from pyworker.utils.crawl import _fetch_crawl4ai
        _fetch_crawl4ai("https://example.com/tos")

        payload = mock_post.call_args[1]["json"]
        self.assertTrue(payload["browser_config"]["params"]["enable_stealth"])
        self.assertEqual(payload["crawler_config"]["params"]["wait_until"], "networkidle")
        self.assertTrue(payload["crawler_config"]["params"]["magic"])

    @patch("pyworker.utils.crawl.requests.post")
    def test_raises_on_success_false(self, mock_post: MagicMock):
        mock_post.return_value = self._make_response(success=False)

        from pyworker.utils.crawl import _fetch_crawl4ai
        with self.assertRaises(RuntimeError):
            _fetch_crawl4ai("https://example.com/tos")

    @patch("pyworker.utils.crawl.requests.post")
    def test_raises_on_http_error(self, mock_post: MagicMock):
        mock_post.side_effect = requests.RequestException("connection refused")

        from pyworker.utils.crawl import _fetch_crawl4ai
        with self.assertRaises(requests.RequestException):
            _fetch_crawl4ai("https://example.com/tos")


class TestFetchMarkdown(unittest.TestCase):
    """Tests for fetch_markdown fallback logic."""

    @patch("pyworker.utils.crawl._fetch_crawl4ai")
    def test_returns_crawl4ai_result(self, mock_crawl4ai: MagicMock):
        mock_crawl4ai.return_value = "# content"
        from pyworker.utils.crawl import fetch_markdown
        self.assertEqual(fetch_markdown("https://example.com/tos"), "# content")

    @patch("pyworker.utils.crawl._fetch_jina")
    @patch("pyworker.utils.crawl._fetch_crawl4ai")
    def test_falls_back_to_jina_on_crawl4ai_error(self, mock_crawl4ai: MagicMock, mock_jina: MagicMock):
        mock_crawl4ai.side_effect = Exception("connection refused")
        mock_jina.return_value = "jina content"

        from pyworker.utils.crawl import fetch_markdown
        result = fetch_markdown("https://example.com/tos")

        self.assertEqual(result, "jina content")
        mock_jina.assert_called_once_with("https://example.com/tos")

    @patch("pyworker.utils.crawl._fetch_jina")
    @patch("pyworker.utils.crawl._fetch_crawl4ai")
    def test_returns_empty_string_when_both_fail(self, mock_crawl4ai: MagicMock, mock_jina: MagicMock):
        mock_crawl4ai.side_effect = Exception("crawl4ai down")
        mock_jina.side_effect = requests.RequestException("jina down")

        from pyworker.utils.crawl import fetch_markdown
        self.assertEqual(fetch_markdown("https://example.com/tos"), "")

    def test_raises_on_empty_url(self):
        from pyworker.utils.crawl import fetch_markdown
        with self.assertRaises(ValueError):
            fetch_markdown("")


class TestFetchJina(unittest.TestCase):
    @patch("pyworker.utils.crawl.requests.get")
    def test_constructs_correct_url(self, mock_get: MagicMock):
        mock_get.return_value = MagicMock(text="# Jina markdown")

        from pyworker.utils.crawl import _fetch_jina
        result = _fetch_jina("https://example.com/tos")

        self.assertEqual(result, "# Jina markdown")
        call_url = mock_get.call_args[0][0]
        self.assertIn("r.jina.ai", call_url)
        self.assertIn("https://example.com/tos", call_url)


if __name__ == "__main__":
    unittest.main()
