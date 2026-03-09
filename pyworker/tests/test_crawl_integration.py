"""
Integration tests for pyworker.utils.crawl against a live crawl4ai instance.

Skipped automatically when crawl4ai is unreachable.
Run with: CRAWL4AI_BASE_URL=http://localhost:11235 uv run pytest tests/test_crawl_integration.py -v -s
"""

import os
import unittest

import requests

_BASE_URL = os.environ.get("CRAWL4AI_BASE_URL", "http://localhost:11235")
_SIMPLE_URL = "https://example.com"
_ANUBIS_URL = "https://trocador.app/en/termsofuse/"


def _crawl4ai_available() -> bool:
    try:
        r = requests.get(f"{_BASE_URL}/health", timeout=3)
        return r.status_code == 200
    except Exception:
        return False


@unittest.skipUnless(_crawl4ai_available(), f"crawl4ai not reachable at {_BASE_URL}")
class TestCrawl4AIIntegration(unittest.TestCase):

    def test_health_endpoint(self):
        r = requests.get(f"{_BASE_URL}/health", timeout=5)
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data.get("status"), "ok")
        print(f"\n  crawl4ai version: {data.get('version', 'unknown')}")

    def test_fetch_markdown_simple_page(self):
        """fetch_markdown returns content for a plain page."""
        import pyworker.utils.crawl as crawl_module

        original = crawl_module.config.CRAWL4AI_BASE_URL
        crawl_module.config.CRAWL4AI_BASE_URL = _BASE_URL
        try:
            result = crawl_module.fetch_markdown(_SIMPLE_URL)
        finally:
            crawl_module.config.CRAWL4AI_BASE_URL = original

        self.assertIsInstance(result, str)
        self.assertGreater(len(result), 50)
        print(f"\n  {_SIMPLE_URL}: {len(result)} chars")
        print(f"  Preview: {result[:150]}")

    def test_fetch_markdown_anubis_protected(self):
        """fetch_markdown bypasses Anubis JS challenge and returns ToS content."""
        import pyworker.utils.crawl as crawl_module

        original = crawl_module.config.CRAWL4AI_BASE_URL
        crawl_module.config.CRAWL4AI_BASE_URL = _BASE_URL
        try:
            result = crawl_module.fetch_markdown(_ANUBIS_URL)
        finally:
            crawl_module.config.CRAWL4AI_BASE_URL = original

        self.assertIsInstance(result, str)
        self.assertGreater(len(result), 200, "Expected actual ToS content, not a challenge page")
        # Anubis challenge pages contain "Checking your browser" or similar
        self.assertNotIn("Checking your browser", result)
        self.assertNotIn("challenge", result.lower()[:500])
        print(f"\n  {_ANUBIS_URL}: {len(result)} chars")
        print(f"  Preview: {result[:300]}")

    def test_crawl_endpoint_stealth_params_accepted(self):
        """POST /crawl with stealth + networkidle params is accepted."""
        r = requests.post(
            f"{_BASE_URL}/crawl",
            json={
                "urls": [_SIMPLE_URL],
                "browser_config": {
                    "type": "BrowserConfig",
                    "params": {"headless": True, "enable_stealth": True},
                },
                "crawler_config": {
                    "type": "CrawlerRunConfig",
                    "params": {
                        "cache_mode": "bypass",
                        "magic": True,
                        "wait_until": "networkidle",
                        "delay_before_return_html": 1.0,
                    },
                },
            },
            timeout=30,
        )
        self.assertEqual(r.status_code, 200, f"Unexpected status: {r.text[:200]}")
        data = r.json()
        self.assertTrue(data.get("success"), f"success=false: {data.get('results', [{}])[0].get('error_message')}")
        results = data.get("results", [])
        self.assertTrue(results[0].get("success"))
        print(f"\n  Stealth crawl of {_SIMPLE_URL}: OK")


if __name__ == "__main__":
    unittest.main(verbosity=2)
