"""
Tests for pyworker.utils.crawl
"""

import time
import unittest
from unittest.mock import MagicMock, patch

import requests


class TestExtractMarkdown(unittest.TestCase):
    """Unit tests for _extract_markdown — no I/O involved."""

    def setUp(self):
        from pyworker.utils.crawl import _extract_markdown

        self.extract = _extract_markdown

    def test_fit_markdown_preferred(self):
        self.assertEqual(
            self.extract(
                {"markdown": {"fit_markdown": "clean", "raw_markdown": "raw"}}
            ),
            "clean",
        )

    def test_raw_markdown_fallback_when_fit_empty(self):
        self.assertEqual(
            self.extract({"markdown": {"fit_markdown": "", "raw_markdown": "raw"}}),
            "raw",
        )

    def test_plain_string_markdown(self):
        self.assertEqual(self.extract({"markdown": "plain"}), "plain")

    def test_missing_markdown_key(self):
        self.assertEqual(self.extract({}), "")


class TestFetchCrawl4AI(unittest.TestCase):
    """Unit tests for _fetch_crawl4ai with mocked HTTP."""

    def _make_response(
        self, success: bool = True, markdown: str = "# content"
    ) -> MagicMock:
        r = MagicMock()
        r.json.return_value = {
            "results": [
                {
                    "success": success,
                    "markdown": {"fit_markdown": markdown, "raw_markdown": markdown},
                    "error_message": "",
                }
            ]
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
        self.assertEqual(
            payload["crawler_config"]["params"]["wait_until"], "networkidle"
        )

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
    def test_falls_back_to_jina_on_crawl4ai_error(
        self, mock_crawl4ai: MagicMock, mock_jina: MagicMock
    ):
        mock_crawl4ai.side_effect = Exception("connection refused")
        mock_jina.return_value = "jina content"

        from pyworker.utils.crawl import fetch_markdown

        result = fetch_markdown("https://example.com/tos")

        self.assertEqual(result, "jina content")
        mock_jina.assert_called_once_with("https://example.com/tos")

    @patch("pyworker.utils.crawl._fetch_jina")
    @patch("pyworker.utils.crawl._fetch_crawl4ai")
    def test_returns_empty_string_when_both_fail(
        self, mock_crawl4ai: MagicMock, mock_jina: MagicMock
    ):
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
    """Tests for fetch_legal_corpus discovery and dedup logic."""

    def _make_response(self, results: list[dict]) -> MagicMock:
        r = MagicMock()
        r.json.return_value = {"results": results}
        return r

    def _page(
        self,
        url: str,
        markdown: str,
        success: bool = True,
        internal: list[str] | None = None,
        external: list[str] | None = None,
    ) -> dict:
        return {
            "url": url,
            "success": success,
            "markdown": {"fit_markdown": markdown, "raw_markdown": markdown},
            "links": {
                "internal": [{"href": href} for href in internal or []],
                "external": [{"href": href} for href in external or []],
            },
        }

    @staticmethod
    def _requested_urls(mock_post: MagicMock) -> list[list[str]]:
        return [call[1]["json"]["urls"] for call in mock_post.call_args_list]

    @patch("pyworker.utils.crawl.requests.post")
    def test_request_carries_no_fields_the_server_rejects(self, mock_post: MagicMock):
        # Crawl4AI 0.9 answers 400 to a body carrying any of these. Discovery
        # moved into pyworker so the payload could stay within what it accepts.
        mock_post.return_value = self._make_response(
            [self._page("https://x.com/terms", "Terms text")]
        )

        from pyworker.utils.legal_crawl import fetch_legal_corpus

        fetch_legal_corpus(["https://x.com/terms"])

        params = mock_post.call_args[1]["json"]["crawler_config"]["params"]
        for field in ("deep_crawl_strategy", "js_code", "simulate_user", "session_id"):
            self.assertNotIn(field, params)

    @patch("pyworker.utils.crawl.requests.post")
    def test_follows_only_legal_looking_links(self, mock_post: MagicMock):
        mock_post.side_effect = [
            self._make_response(
                [
                    self._page(
                        "https://x.com/terms",
                        "Terms text",
                        internal=[
                            "https://x.com/privacy-policy",
                            "https://x.com/about",
                        ],
                    )
                ]
            ),
            self._make_response(
                [self._page("https://x.com/privacy-policy", "Privacy text")]
            ),
        ]

        from pyworker.utils.legal_crawl import fetch_legal_corpus

        corpus = fetch_legal_corpus(["https://x.com/terms"])

        self.assertEqual(
            self._requested_urls(mock_post)[1], ["https://x.com/privacy-policy"]
        )
        self.assertEqual(len(corpus.pages), 2)

    @patch("pyworker.utils.crawl.requests.post")
    def test_never_follows_external_links(self, mock_post: MagicMock):
        mock_post.return_value = self._make_response(
            [
                self._page(
                    "https://x.com/terms",
                    "Terms text",
                    external=["https://other.com/terms"],
                )
            ]
        )

        from pyworker.utils.legal_crawl import fetch_legal_corpus

        fetch_legal_corpus(["https://x.com/terms"])

        self.assertEqual(len(mock_post.call_args_list), 1)

    @patch("pyworker.utils.crawl.requests.post")
    def test_skips_links_that_are_not_html(self, mock_post: MagicMock):
        mock_post.return_value = self._make_response(
            [
                self._page(
                    "https://x.com/terms",
                    "Terms text",
                    internal=["https://x.com/terms.pdf"],
                )
            ]
        )

        from pyworker.utils.legal_crawl import fetch_legal_corpus

        fetch_legal_corpus(["https://x.com/terms"])

        self.assertEqual(len(mock_post.call_args_list), 1)

    @patch("pyworker.utils.crawl.requests.post")
    def test_caps_discovered_pages_leaving_room_for_the_seed(
        self, mock_post: MagicMock
    ):
        discovered = [f"https://x.com/legal/{index}-terms" for index in range(20)]
        mock_post.side_effect = [
            self._make_response(
                [self._page("https://x.com/terms", "Terms", internal=discovered)]
            ),
            self._make_response([]),
        ]

        from pyworker.utils.legal_crawl import fetch_legal_corpus, _MAX_PAGES_PER_SEED

        fetch_legal_corpus(["https://x.com/terms"])

        self.assertEqual(
            len(self._requested_urls(mock_post)[1]), _MAX_PAGES_PER_SEED - 1
        )

    @patch("pyworker.utils.crawl.requests.post")
    def test_discovery_does_not_depend_on_link_order(self, mock_post: MagicMock):
        discovered = [f"https://x.com/legal/{index}-terms" for index in range(20)]

        def run(links: list[str]) -> list[str]:
            mock_post.reset_mock()
            mock_post.side_effect = [
                self._make_response(
                    [self._page("https://x.com/terms", "Terms", internal=links)]
                ),
                self._make_response([]),
            ]
            from pyworker.utils.legal_crawl import fetch_legal_corpus

            fetch_legal_corpus(["https://x.com/terms"])
            return self._requested_urls(mock_post)[1]

        self.assertEqual(run(discovered), run(list(reversed(discovered))))

    @patch("pyworker.utils.crawl.requests.post")
    def test_keeps_one_page_per_document_not_per_translation(
        self, mock_post: MagicMock
    ):
        translations = [
            f"https://x.com/help/{locale}/terms"
            for locale in ("de-de", "ja", "ru", "es-es")
        ]
        mock_post.side_effect = [
            self._make_response(
                [self._page("https://x.com/terms", "Terms", internal=translations)]
            ),
            self._make_response([]),
        ]

        from pyworker.utils.legal_crawl import fetch_legal_corpus

        fetch_legal_corpus(["https://x.com/terms"])

        self.assertEqual(len(self._requested_urls(mock_post)[1]), 1)

    @patch("pyworker.utils.crawl.requests.post")
    def test_keeps_documents_that_differ_beyond_their_locale(
        self, mock_post: MagicMock
    ):
        mock_post.side_effect = [
            self._make_response(
                [
                    self._page(
                        "https://x.com/terms",
                        "Terms",
                        internal=[
                            "https://x.com/de/privacy",
                            "https://x.com/de/refund-policy",
                        ],
                    )
                ]
            ),
            self._make_response([]),
        ]

        from pyworker.utils.legal_crawl import fetch_legal_corpus

        fetch_legal_corpus(["https://x.com/terms"])

        self.assertEqual(len(self._requested_urls(mock_post)[1]), 2)

    @patch("pyworker.utils.crawl.requests.post")
    def test_a_page_linked_from_two_seeds_is_fetched_once(self, mock_post: MagicMock):
        shared = "https://x.com/privacy-policy"
        mock_post.side_effect = [
            self._make_response(
                [self._page("https://x.com/terms", "Terms", internal=[shared])]
            ),
            self._make_response([self._page(shared, "Privacy")]),
            self._make_response(
                [self._page("https://x.com/aml", "Aml", internal=[shared])]
            ),
        ]

        from pyworker.utils.legal_crawl import fetch_legal_corpus

        fetch_legal_corpus(["https://x.com/terms", "https://x.com/aml"])

        self.assertEqual(len(mock_post.call_args_list), 3)

    @patch("pyworker.utils.crawl.requests.post")
    def test_resolves_relative_links(self, mock_post: MagicMock):
        mock_post.side_effect = [
            self._make_response(
                [self._page("https://x.com/legal/terms", "Terms", internal=["privacy"])]
            ),
            self._make_response([self._page("https://x.com/legal/privacy", "Privacy")]),
        ]

        from pyworker.utils.legal_crawl import fetch_legal_corpus

        fetch_legal_corpus(["https://x.com/legal/terms"])

        self.assertEqual(
            self._requested_urls(mock_post)[1], ["https://x.com/legal/privacy"]
        )

    @patch("pyworker.utils.crawl.requests.post")
    def test_dedups_by_normalized_url(self, mock_post: MagicMock):
        mock_post.return_value = self._make_response(
            [
                self._page("https://x.com/terms", "Same content"),
                self._page("https://x.com/terms/", "Different content but same URL"),
            ]
        )

        from pyworker.utils.legal_crawl import fetch_legal_corpus

        corpus = fetch_legal_corpus(["https://x.com/terms"])
        combined, urls = corpus.combined, corpus.urls

        self.assertEqual(len(urls), 1)
        self.assertNotIn("Different content", combined)

    @patch("pyworker.utils.crawl.requests.post")
    def test_dedups_by_content_hash(self, mock_post: MagicMock):
        mock_post.return_value = self._make_response(
            [
                self._page("https://x.com/terms", "Identical body"),
                self._page("https://x.com/en/terms", "Identical body"),
            ]
        )

        from pyworker.utils.legal_crawl import fetch_legal_corpus

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

        from pyworker.utils.legal_crawl import fetch_legal_corpus

        hash1 = fetch_legal_corpus(["https://x.com/terms"]).corpus_hash

        mock_post.return_value = self._make_response(results)
        hash2 = fetch_legal_corpus(["https://x.com/terms"]).corpus_hash

        self.assertEqual(hash1, hash2)
        self.assertEqual(len(hash1), 64)

    @patch("pyworker.utils.crawl.requests.post")
    def test_skips_failed_results(self, mock_post: MagicMock):
        mock_post.return_value = self._make_response(
            [
                self._page("https://x.com/terms", "Good"),
                self._page("https://x.com/dead", "", success=False),
            ]
        )

        from pyworker.utils.legal_crawl import fetch_legal_corpus

        urls = fetch_legal_corpus(["https://x.com/terms"]).urls

        self.assertEqual(urls, ["https://x.com/terms"])

    @patch("pyworker.utils.legal_crawl._fetch_crawl4ai")
    @patch("pyworker.utils.crawl.requests.post")
    def test_falls_back_to_single_fetch_when_deep_crawl_fails(
        self, mock_post: MagicMock, mock_crawl4ai: MagicMock
    ):
        mock_post.side_effect = requests.RequestException("deep crawl down")
        mock_crawl4ai.return_value = "single page content"

        from pyworker.utils.legal_crawl import fetch_legal_corpus

        corpus = fetch_legal_corpus(["https://x.com/terms"])
        combined, urls = corpus.combined, corpus.urls

        self.assertIn("single page content", combined)
        self.assertEqual(urls, ["https://x.com/terms"])

    @patch("pyworker.utils.crawl.requests.post")
    def test_empty_seeds_returns_empty(self, mock_post: MagicMock):
        from pyworker.utils.legal_crawl import fetch_legal_corpus

        corpus = fetch_legal_corpus([])
        combined, urls, corpus_hash = corpus.combined, corpus.urls, corpus.corpus_hash

        self.assertEqual(combined, "")
        self.assertEqual(urls, [])
        self.assertEqual(corpus_hash, "")
        mock_post.assert_not_called()

    def test_normalize_url_strips_trailing_slash_and_lowercases_host(self):
        from pyworker.utils.legal_crawl import _normalize_url

        self.assertEqual(_normalize_url("https://X.com/terms/"), "https://x.com/terms")
        self.assertEqual(_normalize_url("https://X.com/"), "https://x.com/")

    @patch("pyworker.utils.crawl.requests.post")
    def test_a_rejected_page_does_not_take_the_batch_with_it(
        self, mock_post: MagicMock
    ):
        # crawl4ai validates every destination before crawling any of them, so
        # one dead link would otherwise reduce the corpus to the seed alone.
        import requests

        mock_post.side_effect = [
            self._make_response(
                [
                    self._page(
                        "https://x.com/legal",
                        "Legal index",
                        internal=[
                            "https://gone.x.com/terms",
                            "https://x.com/privacy-policy",
                        ],
                    )
                ]
            ),
            requests.HTTPError("400 Client Error; body=URL blocked"),
            requests.HTTPError("400 Client Error; body=URL blocked"),
            self._make_response(
                [self._page("https://x.com/privacy-policy", "Privacy text")]
            ),
        ]

        from pyworker.utils.legal_crawl import fetch_legal_corpus

        corpus = fetch_legal_corpus(["https://x.com/legal"])

        self.assertEqual(
            corpus.urls, ["https://x.com/legal", "https://x.com/privacy-policy"]
        )

    @patch("pyworker.utils.crawl.requests.post")
    def test_the_seeds_own_translations_are_not_crawled_again(
        self, mock_post: MagicMock
    ):
        mock_post.side_effect = [
            self._make_response(
                [
                    self._page(
                        "https://x.com/en/terms",
                        "Terms text",
                        internal=[
                            "https://x.com/de/terms",
                            "https://x.com/fr/terms",
                        ],
                    )
                ]
            ),
        ]

        from pyworker.utils.legal_crawl import fetch_legal_corpus

        corpus = fetch_legal_corpus(["https://x.com/en/terms"])

        self.assertEqual(self._requested_urls(mock_post), [["https://x.com/en/terms"]])
        self.assertEqual(corpus.urls, ["https://x.com/en/terms"])

    def test_budget_prefers_named_documents_over_an_index(self):
        from pyworker.utils.legal_crawl import _candidate_rank, _descendant_counts

        keys = {
            "x.com/legal",
            "x.com/legal/privacy",
            "x.com/legal/privacy/us-notice",
            "x.com/legal/eea-terms",
            "x.com/legal/micar",
        }
        descendants = _descendant_counts(keys)
        ranked = sorted(keys, key=lambda key: _candidate_rank(key, descendants))

        # The index of the others ranks below them; a policy carrying one
        # sub-notice is still a policy, and a page that names no kind is last.
        self.assertEqual(ranked[0], "x.com/legal/privacy")
        self.assertLess(
            ranked.index("x.com/legal/eea-terms"), ranked.index("x.com/legal")
        )
        self.assertLess(ranked.index("x.com/legal"), ranked.index("x.com/legal/micar"))

    def test_a_passage_link_is_not_its_own_document(self):
        from pyworker.utils.legal_crawl import _document_key

        self.assertEqual(
            _document_key("https://x.com/legal/terms%23:~:text%3DFees"),
            _document_key("https://x.com/legal/terms"),
        )

    def test_a_jurisdiction_is_not_mistaken_for_a_translation(self):
        from pyworker.utils.legal_crawl import _locale_free_path

        self.assertEqual(_locale_free_path("/de/terms"), _locale_free_path("/fr/terms"))
        self.assertNotEqual(
            _locale_free_path("/us/terms"), _locale_free_path("/eu/terms")
        )
        self.assertNotEqual(
            _locale_free_path("/uk/privacy"), _locale_free_path("/de/privacy")
        )

    @patch("pyworker.utils.crawl.requests.post")
    def test_follows_legal_paths_the_glob_list_does_not_name(
        self, mock_post: MagicMock
    ):
        # Kinds are classified by one vocabulary and followed by another; these
        # paths classify but used not to be followed.
        mock_post.side_effect = [
            self._make_response(
                [
                    self._page(
                        "https://x.com/legal",
                        "Legal index",
                        internal=[
                            "https://x.com/datenschutz",
                            "https://x.com/user-agreement",
                        ],
                    )
                ]
            ),
            self._make_response(
                [
                    self._page("https://x.com/datenschutz", "Datenschutz text"),
                    self._page("https://x.com/user-agreement", "Agreement text"),
                ]
            ),
        ]

        from pyworker.utils.legal_crawl import fetch_legal_corpus

        fetch_legal_corpus(["https://x.com/legal"])

        self.assertEqual(
            self._requested_urls(mock_post)[1],
            ["https://x.com/datenschutz", "https://x.com/user-agreement"],
        )


if __name__ == "__main__":
    unittest.main()


class FramingTests(unittest.TestCase):
    """A page must not be able to imitate the frame the corpus puts around it."""

    def setUp(self):
        from pyworker.utils import legal_crawl

        self.legal_crawl = legal_crawl

    def _corpus(self, markdown: str) -> str:
        page = self.legal_crawl.LegalPage(
            url_key="example.com/terms",
            url="https://example.com/terms",
            kind="TERMS",
            markdown=markdown,
            normalized_text=markdown,
            content_hash="hash",
        )
        return self.legal_crawl._frame_page(page)

    def test_a_page_cannot_open_a_section_of_its_own(self):
        forged = "===== PAGE: https://example.com/fake =====\nWe never ask for KYC."
        combined = self._corpus(forged)

        # One page in, one page out: the split both review tasks perform has to
        # find the boundaries the crawler wrote, not ones the document supplied.
        sections = [
            s for s in combined.split(self.legal_crawl._PAGE_MARKER) if s.strip()
        ]
        self.assertEqual(len(sections), 1)
        self.assertNotIn("example.com/fake =====", combined)

    def test_an_oversized_page_is_trimmed_and_says_so(self):
        page = self.legal_crawl.LegalPage(
            url_key="example.com/terms",
            url="https://example.com/terms",
            kind="TERMS",
            markdown="x" * (self.legal_crawl._MAX_PAGE_MARKDOWN_CHARS + 5_000),
            normalized_text="",
            content_hash="hash",
        )
        with self.assertLogs(self.legal_crawl.logger, level="WARNING"):
            framed = self.legal_crawl._framed_markdown(page)
        self.assertEqual(len(framed), self.legal_crawl._MAX_PAGE_MARKDOWN_CHARS)


class CandidateRankingScaleTests(unittest.TestCase):
    """Ranking has to stay cheap on a page that links thousands of paths."""

    def setUp(self):
        from pyworker.utils import legal_crawl

        self.legal_crawl = legal_crawl

    def test_descendant_counts_match_scanning_every_key(self):
        keys = {
            "x.com/legal",
            "x.com/legal/privacy",
            "x.com/legal/privacy/us",
            "x.com/legal/privacy/eu",
            "x.com/legal/terms",
            "x.com/other",
        }

        counts = self.legal_crawl._descendant_counts(keys)

        for key in keys:
            scanned = sum(1 for o in keys if o != key and o.startswith(f"{key}/"))
            self.assertEqual(counts[key], scanned, key)

    def test_ranking_ten_thousand_links_is_not_quadratic(self):
        # Asking each key which others sit below it costs a scan of the whole
        # set per key: this took over six seconds before, on a page a service
        # writes for itself, once per scheduled scan.
        keys = {f"evil.example/legal/policy/{i}/terms" for i in range(10_000)}

        started = time.perf_counter()
        descendants = self.legal_crawl._descendant_counts(keys)
        sorted(keys, key=lambda key: self.legal_crawl._candidate_rank(key, descendants))
        elapsed = time.perf_counter() - started

        self.assertLess(elapsed, 1.0, f"ranking 10k links took {elapsed:.2f}s")

    def test_a_deep_path_costs_no_more_than_a_shallow_one(self):
        # Every step of the ancestor walk copies the prefix, so depth alone
        # decided the cost, and the path is written by the audited service. One
        # link of this shape took fifteen seconds.
        deep = "evil.example/" + "/".join(f"s{i}" for i in range(128_000))

        started = time.perf_counter()
        self.legal_crawl._descendant_counts({deep})
        elapsed = time.perf_counter() - started

        self.assertLess(elapsed, 0.5, f"counting one deep key took {elapsed:.2f}s")

    def test_a_deep_link_never_reaches_ranking(self):
        entry = {
            "url": "https://evil.example/terms",
            "links": {
                "internal": [
                    {
                        "href": "https://evil.example/legal/"
                        + "/".join(f"s{i}" for i in range(128_000))
                    }
                ]
            },
        }

        self.assertEqual(
            self.legal_crawl._discover_candidates(entry, "evil.example/terms", set()),
            {},
        )

    def test_links_matching_nothing_are_still_only_looked_at_so_many_times(self):
        # A cap on candidates kept never fires when nothing matches, and
        # rejecting a link costs the same as accepting one.
        entry = {
            "url": "https://evil.example/terms",
            "links": {
                "internal": [
                    {"href": f"https://evil.example/blog/post-{i}"}
                    for i in range(250_000)
                ]
            },
        }

        started = time.perf_counter()
        with self.assertLogs(self.legal_crawl.logger, level="WARNING"):
            candidates = self.legal_crawl._discover_candidates(
                entry, "evil.example/terms", set()
            )
        elapsed = time.perf_counter() - started

        self.assertEqual(candidates, {})
        self.assertLess(elapsed, 1.0, f"rejecting 250k links took {elapsed:.2f}s")

    def test_the_page_order_does_not_decide_which_links_are_kept(self):
        links = [
            {"href": f"https://evil.example/legal/policy-{i}"}
            for i in range(self.legal_crawl._MAX_LINKS_INSPECTED_PER_PAGE * 2)
        ]
        entry = {"url": "https://evil.example/terms", "links": {"internal": links}}
        reversed_entry = {
            "url": "https://evil.example/terms",
            "links": {"internal": list(reversed(links))},
        }

        with self.assertLogs(self.legal_crawl.logger, level="WARNING"):
            forwards = self.legal_crawl._discover_candidates(entry, "", set())
        with self.assertLogs(self.legal_crawl.logger, level="WARNING"):
            backwards = self.legal_crawl._discover_candidates(reversed_entry, "", set())

        # Ranking is a total order over the keys, so the pages a budget buys are
        # the same however the page happened to list them.
        descendants = self.legal_crawl._descendant_counts(forwards)
        rank = self.legal_crawl._candidate_rank
        self.assertEqual(
            sorted(forwards, key=lambda k: rank(k, descendants))[:8],
            sorted(backwards, key=lambda k: rank(k, descendants))[:8],
        )

    def test_an_absurdly_long_page_address_takes_no_links_from_it(self):
        # Resolving a relative link against the page's own address pays for that
        # address once per link, and the address is where a redirect landed.
        entry = {
            "url": "https://evil.example/" + "a" * self.legal_crawl._MAX_URL_CHARS,
            "links": {"internal": [{"href": "https://evil.example/legal/terms"}]},
        }

        with self.assertLogs(self.legal_crawl.logger, level="WARNING"):
            candidates = self.legal_crawl._discover_candidates(entry, "", set())

        self.assertEqual(candidates, {})

    def test_an_absurdly_long_link_is_dropped_before_it_is_parsed(self):
        entry = {
            "url": "https://evil.example/terms",
            "links": {
                "internal": [
                    {
                        "href": "https://evil.example/legal/terms?x="
                        + "a" * self.legal_crawl._MAX_URL_CHARS
                    }
                ]
            },
        }

        self.assertEqual(
            self.legal_crawl._discover_candidates(entry, "evil.example/terms", set()),
            {},
        )
