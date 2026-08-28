"""
Normalization, hashing and diffing for legal documents.

Pure functions, no I/O. The hash produced here drives change detection, so
normalization decides how much noise a reviewer sees: legal pages re-render
copyright years, "last updated" lines and tracking parameters without the terms
themselves changing, and every one of those would otherwise look like an edit.
"""

import hashlib
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass
from difflib import unified_diff
from enum import Enum
from typing import Iterable, List
from urllib.parse import urlparse

# A change smaller than this many words is recorded but not announced. It is the
# scale of a typo fix or a reworded sentence, not a change of terms.
MATERIAL_WORD_THRESHOLD = 8

# Diffs are fed to a summarizer, so the payload is bounded regardless of how
# large the underlying edit was.
MAX_DIFF_CHARS = 12_000

# difflib is quadratic in the number of differing lines, and nothing upstream
# caps how much markdown a crawled page can carry. A 3.4 MB document takes over
# three minutes to diff, which stalls every service queued behind it.
MAX_DOCUMENT_CHARS = 400_000

# Below this, a page is far more likely to be a challenge interstitial or an
# error than a legal document. Storing one as the baseline would make the next
# successful fetch look like the terms were rewritten.
MIN_DOCUMENT_CHARS = 500

# Negation and obligation carry the legal force of a clause: dropping "not"
# reverses a promise while changing one word, far too few to clear the size
# threshold. Modals with common synonyms ("may", "will", "shall") are left out,
# since rewording one to another changes nothing but would flag every time.
_DECISIVE_WORDS = frozenset(
    {
        "cannot",
        "mandatory",
        "must",
        "never",
        "no",
        "none",
        "not",
        "obliged",
        "prohibited",
        "required",
        "unless",
        "without",
    }
)

_DATE_PLACEHOLDER = "<date>"

# A line is dropped only when nothing but publication metadata remains once
# markdown decoration, dates and numbers are taken out. Matching a prefix
# instead would drop the rest of the line with it, so a clause introduced by
# "Effective from 1 January 2026: ..." would vanish from both the change log and
# the hash that decides whether the terms get re-reviewed.
_VOLATILE_LABEL_RE = re.compile(
    r"^(last\s+(updated|modified|revised|amended)|effective\s+(as\s+of|date|from)?"
    r"|date\s+of\s+last\s+revision|version|copyright|all\s+rights\s+reserved)$",
    re.IGNORECASE,
)

# Markdown decoration and the punctuation that separates a label from its value.
# Excludes the angle brackets so the date placeholder survives.
_DECORATION_RE = re.compile(r"[*_#\-–:.,()\[\]]")
_BLOCKQUOTE_PREFIX_RE = re.compile(r"^[>\s]+")

_DATE_RE = re.compile(
    r"\b(\d{4}-\d{2}-\d{2}"
    r"|\d{1,2}[/.]\d{1,2}[/.]\d{2,4}"
    r"|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}"
    r"|\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+\d{4})\b",
    re.IGNORECASE,
)

# Tracking and session parameters on links churn without the target changing.
_LINK_TARGET_RE = re.compile(r"\]\(([^)\s]+)(\s+\"[^\"]*\")?\)")

_ZERO_WIDTH_RE = re.compile(r"[​-‏‪-‮﻿]")

# A bare year or the copyright sign is publication metadata wherever it appears
# on an otherwise metadata-only line.
_METADATA_TOKEN_RE = re.compile(r"^(©|c|\d{1,4}|<date>)$", re.IGNORECASE)
_COPYRIGHT_MARK_RE = re.compile(r"©|\(c\)|copyright", re.IGNORECASE)
# A version number churns on republish, but the sentence around it may be real
# text, so the number is normalized rather than the line dropped.
_VERSION_RE = re.compile(r"\b(version)\s+v?\d+(\.\d+)*", re.IGNORECASE)
_YEAR_RE = re.compile(r"\b(19|20)\d{2}\b")

_WORD_RE = re.compile(r"[A-Za-z0-9']+")


# Wording used by bot challenges and access-denied pages, which return HTTP 200
# with a body that is not the document.
_BLOCKED_PAGE_RE = re.compile(
    r"just a moment"
    r"|checking your browser"
    r"|enable javascript( and cookies)? to continue"
    r"|requiring captcha"
    r"|attention required"
    r"|access denied"
    r"|verify you are (a )?human"
    r"|ddos protection by",
    re.IGNORECASE,
)


def is_usable_legal_page(normalized_text: str) -> bool:
    """Whether a fetch plausibly returned the document rather than a challenge.

    Keeping a stale baseline is strictly safer than replacing it with an
    interstitial: the stale one produces no change, the interstitial produces a
    fabricated one the next time the fetch succeeds.
    """
    if len(normalized_text) < MIN_DOCUMENT_CHARS:
        return False
    return not _BLOCKED_PAGE_RE.search(normalized_text[:2000])


class LegalDocumentKind(str, Enum):
    """Mirrors the LegalDocumentKind enum in the Prisma schema."""

    TERMS = "TERMS"
    PRIVACY = "PRIVACY"
    AML = "AML"
    REFUND = "REFUND"
    OTHER = "OTHER"


# Ordered most specific first: a privacy policy is often served under a /legal/
# path, so the generic patterns must only match once the specific ones have not.
_KIND_PATTERNS: "List[tuple[LegalDocumentKind, re.Pattern[str]]]" = [
    (
        LegalDocumentKind.PRIVACY,
        re.compile(r"privacy|datenschutz|gdpr|data[-_]protection|cookie", re.I),
    ),
    (
        LegalDocumentKind.AML,
        re.compile(r"\baml\b|anti[-_]?money|\bkyc\b|know[-_]your", re.I),
    ),
    (
        LegalDocumentKind.REFUND,
        re.compile(
            r"refund|cancellation|returns?[-_]policy|right[-_]of[-_]withdrawal", re.I
        ),
    ),
    (
        LegalDocumentKind.TERMS,
        # agb, tnc and impressum are the German and abbreviated forms, common
        # enough among listed services to be worth matching by name.
        re.compile(
            r"terms|\btos\b|\btnc\b|conditions|user[-_]agreement|legal"
            r"|policies|\bagb\b|impressum|imprint",
            re.I,
        ),
    ),
]


def classify_legal_document_kind(url: str) -> LegalDocumentKind:
    path = urlparse(url).path or url
    for kind, pattern in _KIND_PATTERNS:
        if pattern.search(path):
            return kind
    return LegalDocumentKind.OTHER


class LegalChangeLevel(str, Enum):
    """How much a document moved between two crawls.

    MINOR and MATERIAL mirror the LegalChangeLevel enum in the Prisma schema, so
    the value is written straight to the column. NONE is never persisted: a
    revision row exists only when something changed.
    """

    NONE = "NONE"
    MINOR = "MINOR"
    MATERIAL = "MATERIAL"


@dataclass(frozen=True)
class LegalTextDiff:
    level: LegalChangeLevel
    changed_words: int
    hunks: str


def normalize_legal_markdown(markdown: str) -> str:
    """Reduce a page to the text whose change means the terms changed."""
    text = unicodedata.normalize("NFKC", markdown[:MAX_DOCUMENT_CHARS])
    text = _ZERO_WIDTH_RE.sub("", text)
    text = _LINK_TARGET_RE.sub(lambda m: f"]({_strip_url_noise(m.group(1))})", text)

    lines: List[str] = []
    for raw_line in text.splitlines():
        line = _DATE_RE.sub(_DATE_PLACEHOLDER, raw_line)
        # A bare year is substantive in a clause ("opened before 2026") but is
        # just the publication year next to a copyright mark, where it would
        # otherwise move the hash once a year.
        if _COPYRIGHT_MARK_RE.search(line):
            line = _YEAR_RE.sub(_DATE_PLACEHOLDER, line)
        line = _VERSION_RE.sub(r"\1 <n>", line)
        line = " ".join(line.split())
        if line and not _is_publication_metadata(line):
            lines.append(line)

    return "\n".join(lines)


def _is_publication_metadata(line: str) -> bool:
    """Whether a line carries only when the document was published."""
    stripped = _BLOCKQUOTE_PREFIX_RE.sub("", line)
    words = [w for w in _DECORATION_RE.sub(" ", stripped).split() if w]
    if not words or len(words) > 8:
        return False

    # A copyright mark carrying a date is a publication notice whatever entity
    # name sits beside it. Without the date it may be a real clause, as in
    # "Copyright remains with you".
    if _COPYRIGHT_MARK_RE.search(stripped) and _DATE_PLACEHOLDER in stripped:
        return True

    labelled = False
    for index, word in enumerate(words):
        if not word or _METADATA_TOKEN_RE.match(word):
            continue
        for size in (3, 2, 1):
            phrase = " ".join(words[index : index + size])
            if _VOLATILE_LABEL_RE.match(phrase):
                labelled = True
                words[index : index + size] = [""] * size
                break
        else:
            return False
    return labelled


def legal_content_hash(markdown: str) -> str:
    """Hash a page by its words, so neither cosmetic edits nor a re-wrap register."""
    words = " ".join(normalize_legal_markdown(markdown).split())
    return hashlib.sha256(words.encode()).hexdigest()


def combined_corpus_hash(page_hashes: Iterable[str]) -> str:
    """Hash a set of pages independently of the order they were crawled in."""
    return hashlib.sha256("".join(sorted(page_hashes)).encode()).hexdigest()


def diff_legal_text(before: str, after: str) -> LegalTextDiff:
    """Compare two revisions of one document, already normalized or not."""
    before_lines = normalize_legal_markdown(before).splitlines()
    after_lines = normalize_legal_markdown(after).splitlines()

    added = [line for line in after_lines if line not in set(before_lines)]
    removed = [line for line in before_lines if line not in set(after_lines)]
    changed_words = _changed_word_count(added, removed)

    # Re-wrapping a paragraph rewrites its lines without changing a word, so
    # the word count, not the line diff, decides whether anything happened.
    if changed_words == 0:
        level = LegalChangeLevel.NONE
    elif changed_words >= MATERIAL_WORD_THRESHOLD or _decisive_words_changed(
        added, removed
    ):
        level = LegalChangeLevel.MATERIAL
    else:
        level = LegalChangeLevel.MINOR

    hunks = "\n".join(unified_diff(before_lines, after_lines, lineterm="", n=2))[
        :MAX_DIFF_CHARS
    ]

    return LegalTextDiff(level=level, changed_words=changed_words, hunks=hunks)


def _strip_url_noise(url: str) -> str:
    return url.split("?", 1)[0].split("#", 1)[0]


def _changed_word_count(added: Iterable[str], removed: Iterable[str]) -> int:
    """Count words that actually differ.

    Rewording one word rewrites its whole line, so counting words on touched
    lines would score a typo fix the same as a newly added clause.
    """
    added_words = _word_counts(added)
    removed_words = _word_counts(removed)
    return sum((added_words - removed_words).values()) + sum(
        (removed_words - added_words).values()
    )


def _decisive_words_changed(added: Iterable[str], removed: Iterable[str]) -> bool:
    """Whether the edit gained or lost a word that carries legal force."""
    delta = _word_counts(added) - _word_counts(removed)
    delta.update(_word_counts(removed) - _word_counts(added))
    return any(word in _DECISIVE_WORDS for word in delta)


def _word_counts(lines: Iterable[str]) -> "Counter[str]":
    return Counter(word.lower() for line in lines for word in _WORD_RE.findall(line))
