"""
Recording of legal document state and the changes between crawls.

This is the persistence side of legal documents. The text analysis it builds on
stays pure in legal_text.py; nothing in that module touches the database.
"""

import logging
import time
from dataclasses import replace
from typing import Any, Dict, Optional

from pyworker.database import (
    clear_legal_document_removal,
    create_legal_revision,
    get_legal_documents,
    mark_legal_document_removed,
    mark_legal_document_unreachable,
    upsert_legal_document,
)
from pyworker.utils.ai import prompt_legal_change_summary
from pyworker.utils.legal_crawl import LegalCorpus, fetch_legal_corpus
from pyworker.utils.legal_text import (
    LegalChangeLevel,
    diff_legal_text,
    is_usable_legal_page,
    legal_content_hash,
    normalize_legal_markdown,
)

logger = logging.getLogger(__name__)

CONFIRMATION_PAUSE_SECONDS = 2.0


def tracked_document_urls(service_id: int) -> list[str]:
    """URLs of the pages already tracked for a service.

    Fetched alongside the declared seeds so a document stays checked once the
    service stops linking to it, and so a crawl can tell a deleted page from one
    it simply did not find.
    """
    return [
        document["url"]
        for document in get_legal_documents(service_id).values()
        if document.get("url")
    ]


def recheck_service_documents(
    service_id: int, tos_urls: list[str], service_name: str = ""
) -> None:
    """Fetch a service's legal documents again and record what moved.

    Moving a document advances the service's tosChangedAt, which is what makes
    the scan sweep pick the service up. The review itself is not rerun here.

    A page that differs from what is stored is fetched once more before it
    counts. Tickers, rotating lists and consent banners differ on every fetch,
    so a difference that does not repeat is noise, and each one accepted would
    cost a model scan.
    """
    known_urls = tracked_document_urls(service_id)
    corpus = fetch_legal_corpus(tos_urls, known_urls=known_urls)
    stored = get_legal_documents(service_id)
    moved = any(_has_moved(stored.get(page.url_key), page) for page in corpus.pages)
    newly_gone = any(
        corpus.is_gone(url_key) and not document.get("removedAt")
        for url_key, document in stored.items()
    )
    if moved or newly_gone:
        time.sleep(CONFIRMATION_PAUSE_SECONDS)
        second = fetch_legal_corpus(tos_urls, known_urls=known_urls)
        corpus = _keep_confirmed_pages(service_id, corpus, second, stored)
        corpus = _keep_confirmed_removals(service_id, corpus, second)
    record_document_changes(service_id, corpus, service_name)


def _has_moved(previous: Optional[Dict[str, Any]], page: Any) -> bool:
    if previous is None or not is_usable_legal_page(page.normalized_text):
        return False
    diff = diff_legal_text(previous["normalizedText"], page.normalized_text)
    return diff.level is not LegalChangeLevel.NONE


def _keep_confirmed_pages(
    service_id: int, first: LegalCorpus, second: LegalCorpus, stored: Dict[str, Any]
) -> LegalCorpus:
    """Keep a moved page only if the second fetch read it the same way.

    An unconfirmed page is replaced by its stored text, so it is still counted
    as checked without being recorded as changed.
    """
    second_pages = {page.url_key: page for page in second.pages}
    pages = []
    for page in first.pages:
        previous = stored.get(page.url_key)
        if not _has_moved(previous, page) or _repeats_the_change(
            previous["normalizedText"], page, second_pages.get(page.url_key)
        ):
            pages.append(page)
            continue
        text = previous["normalizedText"]
        pages.append(
            replace(
                page,
                markdown=text,
                normalized_text=text,
                content_hash=legal_content_hash(text),
            )
        )
        logger.warning(
            f"Unconfirmed difference ignored for service {service_id}: {page.url}"
        )
    return replace(first, pages=pages)


def _repeats_the_change(stored_text: str, first: Any, second: Optional[Any]) -> bool:
    """Whether the second fetch shows the change the first one found.

    Equal hashes are not required, or noise that normalization misses would keep
    a real edit unconfirmed forever. A line both fetches added is the edit; a
    rotating banner adds a different line each time. Lines both fetches dropped
    prove nothing on their own, since a rotated banner drops the stored one, so a
    pure deletion has to read the same way twice.
    """
    if second is None or not is_usable_legal_page(second.normalized_text):
        return False
    if second.content_hash == first.content_hash:
        return True
    before = set(normalize_legal_markdown(stored_text).splitlines())
    first_lines = set(first.normalized_text.splitlines())
    second_lines = set(second.normalized_text.splitlines())
    first_added, second_added = first_lines - before, second_lines - before
    if first_added & second_added:
        return True
    first_removed, second_removed = before - first_lines, before - second_lines
    return not first_added and not second_added and first_removed == second_removed


def _keep_confirmed_removals(
    service_id: int, first: LegalCorpus, second: LegalCorpus
) -> LegalCorpus:
    """Keep a page as gone only if the second fetch found it gone too.

    A removal is published, so one stray 404 must not announce it. An
    unconfirmed one drops its status and the page counts as unreachable.
    """
    statuses = dict(first.statuses)
    for url_key in list(statuses):
        if first.is_gone(url_key) and not second.is_gone(url_key):
            del statuses[url_key]
            logger.warning(
                f"Unconfirmed removal ignored for service {service_id}: {url_key}"
            )
    return replace(first, statuses=statuses)


def record_document_changes(
    service_id: int, corpus: LegalCorpus, service_name: str = ""
) -> None:
    """Store each crawled page and log the ones whose text actually moved.

    Detection is deterministic: normalization has already removed the republish
    noise, so a surviving difference is a real edit. Nothing here calls a model,
    which keeps a service unable to talk the detector out of noticing a change to
    its own terms.
    """
    stored = get_legal_documents(service_id)
    record_removed_documents(service_id, corpus, stored)

    for page in corpus.pages:
        if not is_usable_legal_page(page.normalized_text):
            logger.info(
                f"Skipping unusable legal page for service {service_id}: {page.url} "
                f"({len(page.normalized_text)} chars)"
            )
            continue

        previous = stored.get(page.url_key)
        diff = (
            diff_legal_text(previous["normalizedText"], page.normalized_text)
            if previous
            else None
        )
        changed = (
            previous is not None
            and diff is not None
            and diff.level is not LegalChangeLevel.NONE
        )

        document_id = upsert_legal_document(
            service_id=service_id,
            url_key=page.url_key,
            url=page.url,
            kind=page.kind.value,
            content_hash=page.content_hash,
            normalized_text=page.normalized_text,
            changed=changed,
        )

        if not changed or document_id is None or diff is None:
            continue

        create_legal_revision(
            service_id=service_id,
            document_id=document_id,
            change_level=diff.level.value,
            changed_words=diff.changed_words,
            summary=summarize_change(
                diff.level, diff.hunks, service_name, page.kind.value
            ),
            diff=diff.hunks,
        )
        logger.info(
            f"Legal change recorded for service {service_id}: {page.url} "
            f"({diff.level.value}, {diff.changed_words} words)"
        )


def record_removed_documents(
    service_id: int, corpus: LegalCorpus, stored: Dict[str, Any]
) -> None:
    """Record documents this crawl proved are gone, and only those.

    Removal needs a 404 or 410 from the page's own URL. A service that starts
    blocking the crawler, or whose page merely stopped being linked, has not
    withdrawn anything, and treating silence as removal would publish a change
    that never happened. removedAt then keeps a real removal from being recorded
    again on every later crawl.
    """
    # A page has to come back readable before it counts as published again.
    # Anything else, a challenge page, a 403, a 503, is the crawler being told
    # nothing, and announcing a restore on it means the next 404 announces the
    # removal all over again, publicly, for as long as the service flaps.
    readable = {
        page.url_key
        for page in corpus.pages
        if is_usable_legal_page(page.normalized_text)
    }

    for url_key, document in stored.items():
        document_id = document.get("id")
        if document_id is None:
            continue
        was_removed = bool(document.get("removedAt"))

        if corpus.is_gone(url_key):
            if was_removed:
                continue
            _record_availability_change(
                service_id,
                document_id,
                "The document is no longer published at this address.",
            )
            mark_legal_document_removed(document_id)
            logger.info(f"Legal document removed for service {service_id}: {url_key}")
        elif url_key in readable:
            if was_removed:
                _record_availability_change(
                    service_id,
                    document_id,
                    "The document is published again at this address.",
                )
                clear_legal_document_removal(document_id)
                logger.info(
                    f"Legal document restored for service {service_id}: {url_key}"
                )
        else:
            mark_legal_document_unreachable(document_id)


def _record_availability_change(
    service_id: int, document_id: int, summary: str
) -> None:
    create_legal_revision(
        service_id=service_id,
        document_id=document_id,
        change_level=LegalChangeLevel.MATERIAL.value,
        changed_words=0,
        summary=summary,
        diff=None,
    )


def summarize_change(
    level: LegalChangeLevel, hunks: str, service_name: str, document_kind: str
) -> Optional[str]:
    """Describe a material change in plain English, or return None.

    Minor edits are recorded without a summary: a reworded sentence does not
    warrant a model call, and an empty summary reads better than one explaining
    that nothing meaningful happened.
    """
    if level is not LegalChangeLevel.MATERIAL or not hunks:
        return None
    try:
        return prompt_legal_change_summary(hunks, service_name, document_kind)
    except Exception as exc:
        logger.warning(f"Legal change summary failed: {exc}")
        return None
