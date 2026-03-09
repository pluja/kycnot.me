"""
Web crawling utilities.

Primary: crawl4ai Docker service with stealth mode and JS wait support.
Fallback: Jina Reader (r.jina.ai) for simple pages or when crawl4ai is unavailable.
"""

from typing import Any

import requests

from pyworker.config import config
from pyworker.utils.app_logging import setup_logging

logger = setup_logging(__name__)

_CRAWL4AI_HEADERS = (
    {"Authorization": f"Bearer {config.CRAWL4AI_API_TOKEN}"}
    if config.CRAWL4AI_API_TOKEN
    else {}
)

# BrowserConfig: stealth mode to bypass Cloudflare, Anubis, and similar bot protection.
_BROWSER_CONFIG: dict[str, Any] = {
    "type": "BrowserConfig",
    "params": {
        "headless": True,
        "enable_stealth": True,
    },
}

# CrawlerRunConfig:
#   - magic: auto-dismiss cookie banners and overlays
#   - wait_until networkidle: wait for JS challenges (Anubis, Cloudflare) to resolve
#   - delay_before_return_html: extra buffer after network idle for slow JS renderers
#   - scan_full_page: scroll to trigger lazy-loaded content
_CRAWLER_CONFIG: dict[str, Any] = {
    "type": "CrawlerRunConfig",
    "params": {
        "cache_mode": "bypass",
        "magic": True,
        "wait_until": "networkidle",
        "delay_before_return_html": 2.0,
        "scan_full_page": True,
    },
}


def _extract_markdown(result: dict[str, Any]) -> str:
    """Extract the best available markdown from a /crawl result entry."""
    markdown_obj = result.get("markdown", "")
    if isinstance(markdown_obj, dict):
        # fit_markdown can be empty when the pruning filter is too aggressive
        return markdown_obj.get("fit_markdown") or markdown_obj.get("raw_markdown", "")
    return str(markdown_obj)


def _fetch_crawl4ai(url: str) -> str:
    """Fetch markdown via the crawl4ai /crawl endpoint with stealth mode."""
    logger.debug(f"Fetching {url} via crawl4ai")
    response = requests.post(
        f"{config.CRAWL4AI_BASE_URL}/crawl",
        json={
            "urls": [url],
            "browser_config": _BROWSER_CONFIG,
            "crawler_config": _CRAWLER_CONFIG,
        },
        headers=_CRAWL4AI_HEADERS,
        timeout=config.CRAWL4AI_TIMEOUT,
    )
    response.raise_for_status()
    data = response.json()

    results = data.get("results", [])
    if not results or not results[0].get("success"):
        error = results[0].get("error_message", "unknown") if results else "empty results"
        raise RuntimeError(f"crawl4ai failed for {url}: {error}")

    markdown = _extract_markdown(results[0])
    logger.info(f"crawl4ai completed for {url} ({len(markdown)} chars)")
    return markdown


def _fetch_jina(url: str) -> str:
    """Fetch markdown via Jina Reader (fallback)."""
    jina_url = f"https://r.jina.ai/{url}"
    logger.debug(f"Fetching via Jina Reader: {jina_url}")
    response = requests.get(jina_url, timeout=80)
    response.raise_for_status()
    return response.text


def fetch_markdown(url: str) -> str:
    """
    Fetch a URL and return its content as markdown.

    Tries crawl4ai first (stealth, JS wait); falls back to Jina Reader on any failure.
    """
    if not url:
        raise ValueError("url must not be empty")

    try:
        return _fetch_crawl4ai(url)
    except Exception as e:
        logger.warning(f"crawl4ai failed for {url} ({e}), falling back to Jina Reader")

    try:
        return _fetch_jina(url)
    except requests.RequestException as e:
        logger.error(f"Jina Reader also failed for {url}: {e}")
        return ""


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Crawl a URL and print its markdown content.")
    parser.add_argument("--url", required=True, help="The URL to crawl")
    args = parser.parse_args()

    print(f"Crawling {args.url}...")
    print(fetch_markdown(args.url))
