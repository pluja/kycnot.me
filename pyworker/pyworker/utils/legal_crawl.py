"""
Discovery and assembly of a service's legal documents into one crawlable corpus.

Page fetching itself lives in crawl.py; this module decides which pages are
legal documents, which links are worth following, and how a page keeps its
identity between crawls.
"""

import heapq
import logging
import re
from dataclasses import dataclass, field
from fnmatch import fnmatchcase
from collections.abc import Collection, Sequence
from typing import Any
from urllib.parse import urljoin, urlparse

import requests

from pyworker.utils.crawl import (
    _extract_markdown,
    _fetch_crawl4ai,
    _fetch_jina,
    _post_crawl,
)
from pyworker.utils.legal_text import (
    LegalDocumentKind,
    classify_legal_document_kind,
    combined_corpus_hash,
    legal_content_hash,
    normalize_legal_markdown,
)

logger = logging.getLogger(__name__)


_LEGAL_URL_PATTERNS = [
    "*policy*",
    "*acceptable-use*",
    "*fees*",
    "*compliance*",
    "*disclosure*",
    "*data-processing*",
]

_MAX_PAGES_PER_SEED = 8

# Ceilings on what one service can put in front of the model. Measured against
# the live corpus: a median page is 10k chars and the largest service reaches
# 1.3M across its pages, so these bite only at the far tail, and say so when
# they do. Without them a service sets its own review cost.
_MAX_SEEDS = 8
# What one page is allowed to cost us. A page is written by the service being
# audited, so every one of these is a bound on work someone else chooses.
#
# Links are counted as they are looked at, not as they are kept: a quarter of a
# million links matching nothing cost as much to reject as to accept, and a cap
# on what is kept never comes into play. Ranking then follows a total order, so
# which pages win does not depend on the order the page happened to list them.
_MAX_LINKS_INSPECTED_PER_PAGE = 2000
# Longer than any address a service publishes, and past the point browsers and
# servers stop agreeing. Checked before parsing, because parsing is the cost.
_MAX_URL_CHARS = 2048
# Deeper than any real document path. Ancestors are walked when ranking, so a
# path can otherwise be made deep enough to price the walk on its own.
_MAX_PATH_SEGMENTS = 24
_MAX_PAGE_MARKDOWN_CHARS = 120_000
_MAX_COMBINED_CHARS = 400_000

# Both review tasks split the corpus back into pages on this exact string, so a
# page printing it would open a section of its own: one crawl becomes a model
# call per forged section, and the clauses under it are read as coming from
# whatever address the forgery names.
_PAGE_MARKER = "===== PAGE: "
_END_MARKER = "===== END PAGE ====="

# Ceiling on re-checking pages a service no longer links to, so a history of
# moved URLs cannot grow the nightly crawl without bound.
_MAX_KNOWN_PAGES = 12

# A literal list rather than mimetypes.guess_type, which reads /etc/mime.types
# when the file is present and so would classify the same URL differently on dev
# and in Docker.
_NON_HTML_SUFFIXES = frozenset(
    {
        ".atom",
        ".css",
        ".csv",
        ".doc",
        ".docx",
        ".gif",
        ".gz",
        ".ico",
        ".jpeg",
        ".jpg",
        ".js",
        ".json",
        ".md",
        ".mp3",
        ".mp4",
        ".odt",
        ".pdf",
        ".png",
        ".rss",
        ".rtf",
        ".svg",
        ".tar",
        ".txt",
        ".webm",
        ".webp",
        ".woff",
        ".woff2",
        ".xls",
        ".xlsx",
        ".xml",
        ".zip",
    }
)


# Locale segments as sites publish them: "de", "pt-br", "zh_TW".
_LOCALE_SEGMENT_RE = re.compile(r"^([a-z]{2})(?:[-_][a-z]{2})?$", re.IGNORECASE)

# Named languages rather than any two letters, because a jurisdiction segment
# reads identically: a service publishing /legal/us/terms and /legal/eu/terms
# has two documents, not one translated twice, and folding them together would
# drop one silently. "eu" and "uk" are language codes as well, but on a legal
# path they far more often mean the jurisdiction, so they are left out.
_LOCALE_LANGUAGES = frozenset(
    "ar bg cs da de el en es et fa fi fr he hi hr hu id it ja ko lt lv ms nl no"
    " pl pt ro ru sk sl sr sv th tr vi zh".split()
)


def _is_locale_segment(part: str) -> bool:
    match = _LOCALE_SEGMENT_RE.match(part)
    return match is not None and match.group(1).lower() in _LOCALE_LANGUAGES


def _locale_free_path(path: str) -> str:
    """The path with locale segments dropped, so translations group together."""
    kept = [part for part in path.split("/") if part and not _is_locale_segment(part)]
    return "/".join(kept)


def _matches_legal_pattern(path: str) -> bool:
    """Whether a URL path looks like a legal document.

    fnmatchcase against an explicitly lowered path, because fnmatch applies
    os.path.normcase and would therefore behave differently on Windows.
    """
    lowered = path.lower()
    if classify_legal_document_kind(lowered) is not LegalDocumentKind.OTHER:
        return True
    return any(fnmatchcase(lowered, pattern) for pattern in _LEGAL_URL_PATTERNS)


def _is_html_candidate(path: str) -> bool:
    suffix = path.rsplit("/", 1)[-1].rsplit(".", 1)
    return len(suffix) == 1 or f".{suffix[-1].lower()}" not in _NON_HTML_SUFFIXES


def _normalize_url(url: str) -> str:
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    # Also cut an encoded fragment: a link carrying %23:~:text= points at a
    # passage of a page we already have, and would be tracked as its own document.
    path = parsed.path.split("%23")[0].rstrip("/") or "/"
    return f"{parsed.scheme}://{host}{path}"


def document_key(url: str) -> str:
    """The stored identity of a legal page, or empty when there is no page."""
    return _document_key(url) if url.strip() else ""


def _document_key(url: str) -> str:
    """Identity of a legal page across crawls, ignoring scheme and trailing slash."""
    parsed = urlparse(_normalize_url(url))
    return f"{parsed.netloc}{parsed.path}"


@dataclass(frozen=True)
class LegalPage:
    """One crawled legal page, identified by its normalized content."""

    # Identity for storage. The raw URL is not stable: a trailing slash or an
    # http to https upgrade would read as a brand new document and silently
    # reset change detection for that page.
    url_key: str
    url: str
    kind: LegalDocumentKind
    markdown: str
    normalized_text: str
    content_hash: str


# Answers that mean the page is gone rather than merely unavailable. A block,
# a challenge or a server error says nothing about whether the document still
# exists, so only these two are treated as evidence of removal.
_GONE_STATUSES = frozenset({404, 410})


@dataclass(frozen=True)
class LegalCorpus:
    pages: list[LegalPage]
    combined: str
    corpus_hash: str
    # Keyed by document key, for every URL this crawl actually got an answer
    # from. A key absent here was never reached, which is not the same as gone.
    statuses: dict[str, int] = field(default_factory=dict)

    def is_gone(self, url_key: str) -> bool:
        return self.statuses.get(url_key) in _GONE_STATUSES

    @property
    def urls(self) -> list[str]:
        return [page.url for page in self.pages]


def _discover_candidates(
    entry: dict[str, Any], seed_key: str, already_seen: set[str]
) -> dict[str, str]:
    """Legal-looking pages linked from one crawled page, keyed by document key.

    Only links crawl4ai classified as internal are considered, so the same-origin
    rule is its classification rather than a second one of ours.
    """
    candidates: dict[str, str] = {}
    base_url = entry.get("url") or ""
    # Every relative link is resolved against this, so an oversized base is paid
    # for once per link. It reaches us from the page's own address after any
    # redirect, which is as much the service's to choose as the links are.
    if len(base_url) > _MAX_URL_CHARS:
        logger.warning(f"Page address of {len(base_url)} chars, skipping its links")
        return candidates
    links = (entry.get("links") or {}).get("internal") or []

    hrefs = [
        href
        for href in ((link or {}).get("href") or "" for link in links)
        if href and len(href) <= _MAX_URL_CHARS
    ]
    if len(hrefs) > _MAX_LINKS_INSPECTED_PER_PAGE:
        logger.warning(
            f"{base_url}: {len(hrefs)} internal links, looking at "
            f"{_MAX_LINKS_INSPECTED_PER_PAGE} of them"
        )
        # Chosen by the addresses themselves rather than by where the page put
        # them, so the pages a budget buys do not change when a link moves.
        # Shortest first is the same preference ranking applies further down:
        # /terms before /terms/archive/2019.
        hrefs = heapq.nsmallest(
            _MAX_LINKS_INSPECTED_PER_PAGE, hrefs, key=lambda href: (len(href), href)
        )

    for href in hrefs:
        # crawl4ai emits absolute hrefs, but a relative one would otherwise be
        # stored as a broken URL rather than skipped.
        url = urljoin(base_url, href)
        if len(url) > _MAX_URL_CHARS:
            continue
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            continue
        if parsed.path.count("/") > _MAX_PATH_SEGMENTS:
            continue
        if not _matches_legal_pattern(parsed.path) or not _is_html_candidate(
            parsed.path
        ):
            continue
        key = _document_key(url)
        if key == seed_key or key in already_seen or key in candidates:
            continue
        candidates[key] = url

    return candidates


def _post_crawl_tolerating_rejects(urls: list[str]) -> list[dict[str, Any]]:
    """Crawl urls, losing only the ones the server refuses.

    crawl4ai resolves every destination before crawling any of them and rejects
    the request as a whole if one fails, counting an unresolvable host as a
    failure. Without the retry a single stale link to a decommissioned subdomain
    would cut a service's corpus down to its seed, and a service could arrange
    that for itself.
    """
    try:
        return _post_crawl(urls)
    except requests.RequestException as e:
        logger.warning(
            f"Batch of {len(urls)} legal pages rejected, retrying singly: {e}"
        )

    results: list[dict[str, Any]] = []
    for url in urls:
        try:
            results.extend(_post_crawl([url]))
        except requests.RequestException as e:
            logger.warning(f"Skipping legal page {url}: {e}")
    return results


def _descendant_counts(keys: "Collection[str]") -> dict[str, int]:
    """How many of these keys sit below each one, in a single pass.

    Walking every key's ancestors costs one step per path segment. Asking each
    key which others start with it costs a scan of the whole set per key, which
    a page with a few thousand links turns into minutes of the worker's time.
    """
    counts = {key: 0 for key in keys}
    for key in keys:
        prefix = key
        # Bounded rather than walked to the root: each step copies the prefix,
        # so depth alone decides the cost and a path is something the audited
        # service writes. Discovery already refuses anything this deep, and
        # nothing below the limit has a legal document under it.
        for _ in range(_MAX_PATH_SEGMENTS):
            cut = prefix.rfind("/")
            if cut <= 0:
                break
            prefix = prefix[:cut]
            if prefix in counts:
                counts[prefix] += 1
    return counts


def _candidate_rank(
    url_key: str, descendants: dict[str, int]
) -> tuple[int, int, int, str]:
    """Sort key for spending a limited budget on the most document-like pages.

    A service with more legal pages than budget should spend it on /legal/privacy
    rather than on /legal, which is an index of the pages already queued behind
    it, or on a page that only matched because it sits under a legal path.
    """
    last_segment = url_key.rsplit("/", 1)[-1]
    names_a_kind = classify_legal_document_kind(last_segment) is not (
        LegalDocumentKind.OTHER
    )
    # Two or more children, not one: a policy that happens to carry a regional
    # sub-notice is still the policy, while a page every document hangs off is
    # an index of pages already queued behind it.
    children = descendants.get(url_key, 0)
    return (
        0 if names_a_kind else 1,
        1 if children >= 2 else 0,
        len(url_key),
        url_key,
    )


def _crawl_seed_pages(
    seed_url: str, already_seen: set[str], seen_documents: set[str]
) -> list[dict[str, Any]]:
    """Crawl one seed and the legal pages it links to.

    The seed itself is always crawled, even when its own path does not look
    legal: services list pages like /docs/private that only the link filter
    would reject.
    """
    seed_results = _post_crawl([seed_url])
    if not seed_results:
        return []

    candidates: dict[str, str] = {}
    for entry in seed_results:
        if entry.get("success"):
            candidates.update(
                _discover_candidates(entry, _document_key(seed_url), already_seen)
            )

    # Sorted, then capped: with more candidates than budget the same pages must
    # be chosen every run, or the corpus changes on its own between crawls. The
    # seed counts against the cap.
    # One page per document, not per translation of it: a help centre carrying a
    # policy in seven languages would otherwise spend the whole budget on copies
    # of one document and track each as a document of its own. The seed's own
    # document goes in first, since its translations are candidates like any other.
    chosen: list[str] = []
    seen_documents.add(_locale_free_path(urlparse(seed_url).path))
    descendants = _descendant_counts(candidates)
    for key in sorted(candidates, key=lambda key: _candidate_rank(key, descendants)):
        url = candidates[key]
        document = _locale_free_path(urlparse(url).path)
        if document in seen_documents:
            continue
        seen_documents.add(document)
        chosen.append(url)
    chosen = chosen[: _MAX_PAGES_PER_SEED - 1]
    if not chosen:
        return seed_results

    logger.info(f"Discovered {len(chosen)} legal pages linked from {seed_url}")
    return seed_results + _post_crawl_tolerating_rejects(chosen)


def _frame_page(page: LegalPage) -> str:
    """One page wrapped in the markers the review tasks split it back apart on."""
    return f"{_PAGE_MARKER}{page.url} =====\n{_framed_markdown(page)}\n{_END_MARKER}"


def _framed_markdown(page: LegalPage) -> str:
    """Page text that cannot pass itself off as the frame around it."""
    markdown = page.markdown
    if len(markdown) > _MAX_PAGE_MARKDOWN_CHARS:
        logger.warning(
            f"{page.url}: {len(markdown)} chars trimmed to {_MAX_PAGE_MARKDOWN_CHARS}"
        )
        markdown = markdown[:_MAX_PAGE_MARKDOWN_CHARS]
    return markdown.replace("=====", "= = = = =")


def fetch_legal_corpus(
    seed_urls: list[str], known_urls: "Sequence[str]" = ()
) -> LegalCorpus:
    """Fetch a deduplicated, labeled markdown corpus of legal pages.

    For each seed URL: crawl it, then the legal-looking pages it links to.
    known_urls are pages already tracked for this service. They are fetched
    without discovery so that a document keeps being checked after the service
    stops linking to it, and so a crawl can tell a deleted page from one it
    merely failed to find.

    Page hashes are taken over normalized text, so a page that only re-rendered
    its "last updated" line or its tracking parameters keeps the same hash.

    The combined markdown wraps each page in delimited sections so the LLM can
    treat the union as one document but still attribute clauses to a source.
    """
    # Keyed by document key, not normalized URL: the latter keeps the scheme, so
    # an http and an https copy of one page would both survive and then collide
    # on the same row, one silently overwriting the other.
    seen_keys: set[str] = set()
    seen_content_hashes: set[str] = set()
    # Locale-free paths already chosen, threaded across seeds: two seeds landing
    # on the same document in different languages would otherwise each keep one.
    seen_documents: set[str] = set()
    pages: list[LegalPage] = []
    statuses: dict[str, int] = {}

    def absorb(results: list[dict[str, Any]]) -> None:
        for entry in results:
            url = entry.get("url") or ""
            key = _document_key(url) if url else ""
            if not key:
                continue

            # status_code is the first hop of a redirect chain while the body
            # is the page it ended at, so a redirect to a 404 would otherwise
            # read as a healthy 301 and store the error page as the terms.
            status = entry.get("redirected_status_code")
            if not isinstance(status, int) or status == 0:
                status = entry.get("status_code")
            if isinstance(status, int):
                statuses[key] = status
                # An error page still carries a body. Storing it would replace a
                # service's terms with its 404 copy and read as a full rewrite.
                if status >= 400:
                    continue

            if not entry.get("success") or key in seen_keys:
                continue
            markdown = _extract_markdown(entry).strip()
            if not markdown:
                continue
            content_hash = legal_content_hash(markdown)
            if content_hash in seen_content_hashes:
                seen_keys.add(key)
                continue
            seen_keys.add(key)
            seen_content_hashes.add(content_hash)
            pages.append(
                LegalPage(
                    url_key=key,
                    url=url,
                    kind=classify_legal_document_kind(url),
                    markdown=markdown,
                    normalized_text=normalize_legal_markdown(markdown),
                    content_hash=content_hash,
                )
            )

    seeds = list(dict.fromkeys(seed_urls))
    if len(seeds) > _MAX_SEEDS:
        logger.warning(
            f"{len(seeds)} legal seeds given, crawling the first {_MAX_SEEDS}"
        )
        seeds = seeds[:_MAX_SEEDS]
    for seed in seeds:
        if not seed:
            continue
        try:
            results = _crawl_seed_pages(seed, seen_keys, seen_documents)
        except Exception as exc:
            logger.warning(
                f"Crawl failed for {seed} ({exc}), falling back to single fetch"
            )
            try:
                md = _fetch_crawl4ai(seed)
            except Exception:
                try:
                    md = _fetch_jina(seed)
                except Exception as inner_exc:
                    logger.error(f"All fetch methods failed for {seed}: {inner_exc}")
                    continue
            # No status: a fallback fetch says the page answered, not how.
            results = [{"url": seed, "success": True, "markdown": md}]

        absorb(results)

    unchecked = [
        url
        for url in dict.fromkeys(known_urls)
        if url and _document_key(url) not in statuses
    ]
    if unchecked:
        absorb(_post_crawl_tolerating_rejects(unchecked[:_MAX_KNOWN_PAGES]))

    if not pages:
        return LegalCorpus(pages=[], combined="", corpus_hash="", statuses=statuses)

    combined = "\n\n".join(_frame_page(page) for page in pages)
    if len(combined) > _MAX_COMBINED_CHARS:
        logger.warning(
            f"Legal corpus of {len(combined)} chars trimmed to {_MAX_COMBINED_CHARS}"
        )
        combined = combined[:_MAX_COMBINED_CHARS]
    corpus_hash = combined_corpus_hash(page.content_hash for page in pages)
    logger.info(
        f"Legal corpus assembled: {len(pages)} pages, {len(combined)} chars, hash={corpus_hash[:12]}"
    )
    return LegalCorpus(
        pages=pages, combined=combined, corpus_hash=corpus_hash, statuses=statuses
    )
