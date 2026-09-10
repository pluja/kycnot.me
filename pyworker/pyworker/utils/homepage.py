"""
What a service says about itself on its front page, for the description proposal.

The metadata comes from the raw HTML because the crawlers return markdown,
which has already dropped the head. The visible text comes from the crawl, so
a page that renders through scripts still yields something.
"""

import hashlib
import logging
import re
from html import unescape
from typing import Optional, TypedDict

from pyworker.utils.app_http import fetch_url
from pyworker.utils.crawl import fetch_markdown

logger = logging.getLogger(__name__)

# Enough for the pitch above the fold; more is navigation and footer.
VISIBLE_TEXT_CHARS = 1500


class Homepage(TypedDict):
    url: str
    title: str
    metaDescription: str
    ogTitle: str
    ogDescription: str
    heading: str
    visibleText: str


_TITLE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)
_H1 = re.compile(r"<h1[^>]*>(.*?)</h1>", re.IGNORECASE | re.DOTALL)
_META = re.compile(r"<meta\s+[^>]*>", re.IGNORECASE)
_ATTR = re.compile(
    r"""([a-z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))""", re.IGNORECASE
)
_TAGS = re.compile(r"<[^>]+>")


def _clean(text: str) -> str:
    return " ".join(unescape(_TAGS.sub(" ", text)).split())


def _meta_content(html: str) -> dict[str, str]:
    found: dict[str, str] = {}
    for tag in _META.findall(html):
        attrs = {
            m.group(1).lower(): m.group(3) or m.group(4) or m.group(5) or ""
            for m in _ATTR.finditer(tag)
        }
        key = (attrs.get("name") or attrs.get("property") or "").lower()
        if key and "content" in attrs and key not in found:
            found[key] = _clean(attrs["content"])
    return found


def parse_homepage(url: str, html: str, markdown: str) -> Homepage:
    meta = _meta_content(html)
    title = _TITLE.search(html)
    heading = _H1.search(html)
    return {
        "url": url,
        "title": _clean(title.group(1)) if title else "",
        "metaDescription": meta.get("description", ""),
        "ogTitle": meta.get("og:title", ""),
        "ogDescription": meta.get("og:description", ""),
        "heading": _clean(heading.group(1)) if heading else "",
        "visibleText": " ".join(markdown.split())[:VISIBLE_TEXT_CHARS],
    }


def homepage_hash(homepage: Optional[Homepage]) -> str:
    """Identity of what was read, so a decision can be tied to this front page."""
    if homepage is None:
        return "0" * 64
    words = " ".join(
        " ".join(str(homepage[key]).split())
        for key in (
            "title",
            "metaDescription",
            "ogTitle",
            "ogDescription",
            "heading",
            "visibleText",
        )
    )
    return hashlib.sha256(words.encode("utf-8")).hexdigest()


def fetch_homepage(url: str) -> Optional[Homepage]:
    """The front page's own words, or None when nothing could be read."""
    html = fetch_url(url) or ""
    markdown = ""
    try:
        markdown = fetch_markdown(url)
    except Exception as e:
        logger.warning(f"Homepage crawl failed for {url}: {e}")
    if not html and not markdown:
        return None
    return parse_homepage(url, html, markdown)
