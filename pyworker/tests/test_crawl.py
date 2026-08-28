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


class TestFetchLegalCorpus(unittest.TestCase):
    """Tests for fetch_legal_corpus deep crawl + dedup logic."""

    def _make_response(self, results: list[dict]) -> MagicMock:
        r = MagicMock()
        r.json.return_value = {"results": results}
        return r

    def _page(self, url: str, markdown: str, success: bool = True) -> dict:
        return {
            "url": url,
            "success": success,
            "markdown": {"fit_markdown": markdown, "raw_markdown": markdown},
        }

    @patch("pyworker.utils.crawl.requests.post")
    def test_request_uses_deep_crawl_with_legal_filters(self, mock_post: MagicMock):
        mock_post.return_value = self._make_response([self._page("https://x.com/terms", "Terms text")])

        from pyworker.utils.crawl import fetch_legal_corpus
        fetch_legal_corpus(["https://x.com/terms"])

        payload = mock_post.call_args[1]["json"]
        crawler_params = payload["crawler_config"]["params"]
        deep = crawler_params["deep_crawl_strategy"]
        self.assertEqual(deep["type"], "BFSDeepCrawlStrategy")
        self.assertEqual(deep["params"]["max_depth"], 1)
        self.assertFalse(deep["params"]["include_external"])
        filters = deep["params"]["filter_chain"]["params"]["filters"]
        filter_types = [f["type"] for f in filters]
        self.assertIn("URLPatternFilter", filter_types)
        self.assertIn("ContentTypeFilter", filter_types)
        url_filter = next(f for f in filters if f["type"] == "URLPatternFilter")
        patterns = url_filter["params"]["patterns"]
        self.assertIn("*privacy*", patterns)
        self.assertIn("*terms*", patterns)
        self.assertIn("*aml*", patterns)

    @patch("pyworker.utils.crawl.requests.post")
    def test_dedups_by_normalized_url(self, mock_post: MagicMock):
        mock_post.return_value = self._make_response([
            self._page("https://x.com/terms", "Same content"),
            self._page("https://x.com/terms/", "Different content but same URL"),
        ])

        from pyworker.utils.crawl import fetch_legal_corpus
        corpus = fetch_legal_corpus(["https://x.com/terms"])
        combined, urls = corpus.combined, corpus.urls

        self.assertEqual(len(urls), 1)
        self.assertNotIn("Different content", combined)

    @patch("pyworker.utils.crawl.requests.post")
    def test_dedups_by_content_hash(self, mock_post: MagicMock):
        mock_post.return_value = self._make_response([
            self._page("https://x.com/terms", "Identical body"),
            self._page("https://x.com/en/terms", "Identical body"),
        ])

        from pyworker.utils.crawl import fetch_legal_corpus
        corpus = fetch_legal_corpus(["https://x.com/terms"])
        combined, urls = corpus.combined, corpus.urls

        self.assertEqual(len(urls), 1)
        self.assertEqual(combined.count("Identical body"), 1)

    @patch("pyworker.utils.crawl.requests.post")
    def test_corpus_hash_stable_across_runs(self, mock_post: MagicMock):
        results = [
            self._page("https://x.com/terms", "A"),
            self._page("https://x.com/privacy", "B"),
        ]
        mock_post.return_value = self._make_response(results)

        from pyworker.utils.crawl import fetch_legal_corpus
        hash1 = fetch_legal_corpus(["https://x.com/terms"]).corpus_hash

        mock_post.return_value = self._make_response(results)
        hash2 = fetch_legal_corpus(["https://x.com/terms"]).corpus_hash

        self.assertEqual(hash1, hash2)
        self.assertEqual(len(hash1), 64)

    @patch("pyworker.utils.crawl.requests.post")
    def test_skips_failed_results(self, mock_post: MagicMock):
        mock_post.return_value = self._make_response([
            self._page("https://x.com/terms", "Good"),
            self._page("https://x.com/dead", "", success=False),
        ])

        from pyworker.utils.crawl import fetch_legal_corpus
        urls = fetch_legal_corpus(["https://x.com/terms"]).urls

        self.assertEqual(urls, ["https://x.com/terms"])

    @patch("pyworker.utils.crawl._fetch_crawl4ai")
    @patch("pyworker.utils.crawl.requests.post")
    def test_falls_back_to_single_fetch_when_deep_crawl_fails(
        self, mock_post: MagicMock, mock_crawl4ai: MagicMock
    ):
        mock_post.side_effect = requests.RequestException("deep crawl down")
        mock_crawl4ai.return_value = "single page content"

        from pyworker.utils.crawl import fetch_legal_corpus
        corpus = fetch_legal_corpus(["https://x.com/terms"])
        combined, urls = corpus.combined, corpus.urls

        self.assertIn("single page content", combined)
        self.assertEqual(urls, ["https://x.com/terms"])

    @patch("pyworker.utils.crawl.requests.post")
    def test_empty_seeds_returns_empty(self, mock_post: MagicMock):
        from pyworker.utils.crawl import fetch_legal_corpus
        corpus = fetch_legal_corpus([])
        combined, urls, corpus_hash = corpus.combined, corpus.urls, corpus.corpus_hash

        self.assertEqual(combined, "")
        self.assertEqual(urls, [])
        self.assertEqual(corpus_hash, "")
        mock_post.assert_not_called()

    def test_normalize_url_strips_trailing_slash_and_lowercases_host(self):
        from pyworker.utils.crawl import _normalize_url
        self.assertEqual(_normalize_url("https://X.com/terms/"), "https://x.com/terms")
        self.assertEqual(_normalize_url("https://X.com/"), "https://x.com/")


if __name__ == "__main__":
    unittest.main()
