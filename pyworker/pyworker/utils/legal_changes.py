"""
Recording of legal document state and the changes between crawls.

This is the persistence side of legal documents. The text analysis it builds on
stays pure in legal_text.py; nothing in that module touches the database.
"""

import logging
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
from pyworker.utils.legal_crawl import LegalCorpus
from pyworker.utils.legal_text import (
    LegalChangeLevel,
    diff_legal_text,
    is_usable_legal_page,
)

logger = logging.getLogger(__name__)


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
