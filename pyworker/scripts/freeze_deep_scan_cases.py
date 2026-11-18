"""Snapshot what a deep scan reads for each service, so models can be compared on identical input.

Runs inside the worker container, where the crawler and the database are:

    docker exec -i kycnotme-pyworker-1 .venv/bin/python - slug [slug ...] < freeze_deep_scan_cases.py > cases.json

Read-only: it crawls and reads, and writes nothing to the database. The pages
are kept after the completeness filter, as the scan would send them.
"""

import json
import sys

from pyworker.database import (
    fetch_attribute_catalog,
    fetch_service_attributes,
    fetch_service_listing_record,
)
from pyworker.database import get_db_connection
from pyworker.tasks.deep_scan import DeepScanTask
from pyworker.utils.homepage import fetch_homepage
from pyworker.utils.legal_changes import tracked_document_urls
from pyworker.utils.legal_crawl import fetch_legal_corpus


def service_by_slug(slug: str) -> dict:
    with get_db_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT s.id, s.name, s.slug, s.description, s."kycLevel", s."kycPolicyMd",
                       s."tosUrls", s."serviceUrls",
                       (SELECT array_agg(c.name ORDER BY c.name)
                          FROM "_ServiceToCategory" cs JOIN "Category" c ON c.id = cs."A"
                         WHERE cs."B" = s.id)
                FROM "Service" s WHERE s.slug = %s
                """,
                (slug,),
            )
            row = cursor.fetchone()
    if row is None:
        raise SystemExit(f"No service with slug {slug!r}")
    keys = (
        "id",
        "name",
        "slug",
        "description",
        "kycLevel",
        "kycPolicyMd",
        "tosUrls",
        "serviceUrls",
        "categories",
    )
    return dict(zip(keys, row))


def freeze(slug: str, task: DeepScanTask) -> dict:
    service = service_by_slug(slug)
    corpus = fetch_legal_corpus(
        list(service["tosUrls"] or []), known_urls=tracked_document_urls(service["id"])
    )
    filtered_corpus = task._filter_complete_pages(corpus.combined)
    kept_sections = filtered_corpus.split("===== PAGE: ")
    pages = [
        {
            "url": page.url,
            "urlKey": page.url_key,
            "kind": page.kind.value,
            "markdown": page.markdown,
        }
        for page in corpus.pages
        if any(section.startswith(f"{page.url} =====") for section in kept_sections)
    ]
    homepage = (
        fetch_homepage(service["serviceUrls"][0]) if service["serviceUrls"] else None
    )
    return {
        "service": service,
        "corpus": filtered_corpus,
        "pages": pages,
        "droppedIncomplete": [
            page.url
            for page in corpus.pages
            if page.url not in {p["url"] for p in pages}
        ],
        "currentAttributeIds": [
            int(a["id"]) for a in fetch_service_attributes(service["id"])
        ],
        "listingRecord": fetch_service_listing_record(service["id"]),
        "homepage": dict(homepage) if homepage else None,
    }


def main() -> None:
    task = DeepScanTask()
    cases = {}
    for slug in sys.argv[1:]:
        print(f"freezing {slug}", file=sys.stderr)
        cases[slug] = freeze(slug, task)
    json.dump(
        {"catalog": fetch_attribute_catalog(), "cases": cases}, sys.stdout, default=str
    )


main()
