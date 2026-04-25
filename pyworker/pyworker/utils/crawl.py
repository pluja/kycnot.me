"""
Web crawling utilities.

Primary: crawl4ai Docker service with stealth mode and JS wait support.
Fallback: Jina Reader (r.jina.ai) for simple pages or when crawl4ai is unavailable.
"""

import hashlib
import logging
from typing import Any
from urllib.parse import urlparse

import requests

from pyworker.config import config

logger = logging.getLogger(__name__)

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


# Legal-corpus deep crawl
# Strict URL pattern filter: only follow links whose path contains a legal-relevant
# slug. We do not want to drag in About / Pricing / Blog pages.
_LEGAL_URL_PATTERNS = [
    "*privacy*",
    "*terms*",
    "*tos*",
    "*aml*",
    "*kyc*",
    "*refund*",
    "*cookie*",
    "*gdpr*",
    "*legal*",
    "*policy*",
    "*acceptable-use*",
    "*fees*",
    "*compliance*",
    "*disclosure*",
    "*data-processing*",
    "*data-protection*",
]

_MAX_PAGES_PER_SEED = 8


def _normalize_url(url: str) -> str:
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    path = parsed.path.rstrip("/") or "/"
    return f"{parsed.scheme}://{host}{path}"


def _deep_crawl_seed(seed_url: str) -> list[dict[str, Any]]:
    """Deep-crawl one seed URL with the legal-pages filter chain. Returns the
    list of result entries from crawl4ai (each with url + markdown).
    """
    crawler_params: dict[str, Any] = {
        **_CRAWLER_CONFIG["params"],
        "deep_crawl_strategy": {
            "type": "BFSDeepCrawlStrategy",
            "params": {
                "max_depth": 1,
                "max_pages": _MAX_PAGES_PER_SEED,
                "include_external": False,
                "filter_chain": {
                    "type": "FilterChain",
                    "params": {
                        "filters": [
                            {
                                "type": "URLPatternFilter",
                                "params": {"patterns": _LEGAL_URL_PATTERNS},
                            },
                            {
                                "type": "ContentTypeFilter",
                                "params": {"allowed_types": ["text/html"]},
                            },
                        ]
                    },
                },
            },
        },
    }
    payload = {
        "urls": [seed_url],
        "browser_config": _BROWSER_CONFIG,
        "crawler_config": {"type": "CrawlerRunConfig", "params": crawler_params},
    }
    response = requests.post(
        f"{config.CRAWL4AI_BASE_URL}/crawl",
        json=payload,
        headers=_CRAWL4AI_HEADERS,
        timeout=config.CRAWL4AI_TIMEOUT,
    )
    response.raise_for_status()
    data = response.json()
    return data.get("results") or []


def fetch_legal_corpus(seed_urls: list[str]) -> tuple[str, list[str], str]:
    """Fetch a deduplicated, labeled markdown corpus of legal pages.

    For each seed URL: deep-crawl one level deep, restricted to same-domain pages
    whose path matches a legal-keyword pattern. Pages are deduplicated by both
    normalized URL and markdown content hash.

    Returns (combined_markdown, fetched_urls, corpus_hash).

    The combined markdown wraps each page in delimited sections so the LLM can
    treat the union as one document but still attribute clauses to a source.
    """
    seen_urls: set[str] = set()
    seen_content_hashes: set[str] = set()
    pages: list[tuple[str, str, str]] = []  # (url, content_hash, markdown)

    for seed in seed_urls:
        if not seed:
            continue
        try:
            results = _deep_crawl_seed(seed)
        except Exception as exc:
            logger.warning(f"Deep crawl failed for {seed} ({exc}), falling back to single fetch")
            try:
                md = _fetch_crawl4ai(seed)
            except Exception:
                try:
                    md = _fetch_jina(seed)
                except Exception as inner_exc:
                    logger.error(f"All fetch methods failed for {seed}: {inner_exc}")
                    continue
            results = [{"url": seed, "success": True, "markdown": md}]

        for entry in results:
            if not entry.get("success"):
                continue
            url = entry.get("url") or ""
            normalized = _normalize_url(url)
            if not normalized or normalized in seen_urls:
                continue
            markdown = _extract_markdown(entry).strip()
            if not markdown:
                continue
            content_hash = hashlib.sha256(markdown.encode()).hexdigest()
            if content_hash in seen_content_hashes:
                seen_urls.add(normalized)
                continue
            seen_urls.add(normalized)
            seen_content_hashes.add(content_hash)
            pages.append((url, content_hash, markdown))

    if not pages:
        return "", [], ""

    combined = "\n\n".join(
        f"===== PAGE: {url} =====\n{md}\n===== END PAGE ====="
        for url, _, md in pages
    )
    fetched_urls = [url for url, _, _ in pages]
    # Sort hashes by normalized URL so the corpus hash is order-independent;
    # BFS deep-crawl may visit pages in different order between runs.
    sorted_hashes = sorted((_normalize_url(url), h) for url, h, _ in pages)
    corpus_hash = hashlib.sha256(
        "".join(h for _, h in sorted_hashes).encode()
    ).hexdigest()
    logger.info(
        f"Legal corpus assembled: {len(pages)} pages, {len(combined)} chars, hash={corpus_hash[:12]}"
    )
    return combined, fetched_urls, corpus_hash


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Crawl a URL and print its markdown content.")
    parser.add_argument("--url", required=True, help="The URL to crawl")
    args = parser.parse_args()

    print(f"Crawling {args.url}...")
    print(fetch_markdown(args.url))
