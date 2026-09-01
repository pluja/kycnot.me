"""Deep scan task: produces a structured ServiceSuggestion with proposed edits.

Unlike the cron-driven `tos_review` task, this task is admin-triggered through
the ServiceScanJob queue and authored by the bot user. It crawls the legal
corpus once and asks the LLM for a single combined output covering ToS
highlights, an inferred KYC level, KYC policy notes, attribute add/remove
proposals, and freeform warnings. The result lands on
ServiceSuggestion.proposedEdits for admin review. Public Service.tosReview is
only updated later when an admin applies the proposal.
"""

from typing import Any, Dict, List, Optional

from pyworker.database import (
    mark_service_scan_attempted,
    LISTING_CHECK_FIELDS,
    DeepScanResultType,
    fetch_attribute_catalog,
    fetch_scan_declines,
    fetch_service_listing_record,
    mark_service_scanned,
    fetch_service_attributes,
    fetch_service_for_deep_scan,
    save_deep_scan_proposed_edits,
)
from pyworker.tasks.base import Task
from pyworker.utils.ai import (
    prompt_check_tos_review,
    prompt_deep_scan,
)
from pyworker.utils.legal_changes import (
    record_document_changes,
    tracked_document_urls,
)
from pyworker.utils.legal_crawl import document_key, fetch_legal_corpus
from pyworker.utils.legal_text import is_grounded
from pyworker.utils.listing_values import storable_value, values_disagree
from pyworker.utils.scan_fingerprint import scan_fingerprint


def _format_attribute_catalog(catalog: List[Dict[str, Any]]) -> str:
    """Render the attribute catalog as compact markdown the LLM can scan."""
    by_category: Dict[str, List[Dict[str, Any]]] = {}
    for attribute in catalog:
        by_category.setdefault(attribute["category"], []).append(attribute)

    lines: List[str] = []
    for category in sorted(by_category):
        lines.append(f"### {category}")
        for attribute in by_category[category]:
            description = (attribute.get("description") or "").strip()
            description_part = f" - {description}" if description else ""
            lines.append(
                f'- id={attribute["id"]} type={attribute["type"]} title="{attribute["title"]}"'
                f"{description_part}"
            )
        lines.append("")
    return "\n".join(lines).strip()


def _has_actionable_items(
    proposed_edits: Dict[str, Any], kyc_level_changed: bool
) -> bool:
    """Whether a scan found anything a reviewer has to decide.

    A refreshed review of unchanged terms is not a decision. Without this the
    nightly pass would queue a suggestion for every service it looked at.
    """
    attributes = proposed_edits["attributes"]
    return bool(
        kyc_level_changed
        or attributes["add"]
        or attributes["remove"]
        or proposed_edits["listingChecks"]
    )


class DeepScanTask(Task):
    """Deep scan of a service's legal corpus, from the admin button or the cron."""

    def __init__(self, only_when_actionable: bool = False):
        super().__init__("deep_scan")
        # An admin who pressed the button wants to see the result either way.
        # The nightly pass must stay silent unless it found something to decide,
        # or it fills the review queue with services nobody needs to look at.
        self.only_when_actionable = only_when_actionable

    def run(self, service_id: int) -> Optional[int]:
        """Run a deep scan for the given service.

        Returns the new ServiceSuggestion id, or None if nothing was produced.
        """
        try:
            suggestion_id, read_the_documents = self._run(service_id)
        finally:
            # Recorded however this ended, including a crash. The sweep takes
            # the least recently tried first, so a service that fails every
            # night waits its turn rather than sorting to the head of every
            # later sweep and being paid for again each time.
            mark_service_scan_attempted(service_id)

        # Only a scan that got as far as an answer counts as having looked. A
        # crawl that came back empty has learned nothing, and saying otherwise
        # would leave the service unscanned until its documents happened to
        # change. Finding nothing worth proposing is an answer.
        if read_the_documents:
            mark_service_scanned(service_id)
        return suggestion_id

    def _run(self, service_id: int) -> tuple[Optional[int], bool]:
        """The scan itself, and whether it read the documents through to an answer."""
        service = fetch_service_for_deep_scan(service_id)
        if service is None:
            self.logger.error(f"Service {service_id} not found, skipping deep scan")
            return None, False

        service_name = service["name"]
        tos_urls: List[str] = list(service.get("tosUrls") or [])

        if not tos_urls:
            self.logger.warning(
                f"Service {service_name} (ID: {service_id}) has no tosUrls, skipping deep scan"
            )
            return None, False

        self.logger.info(
            f"Deep-scanning service: {service_name} (ID: {service_id}); seeds={tos_urls}"
        )

        corpus = fetch_legal_corpus(
            tos_urls, known_urls=tracked_document_urls(service_id)
        )
        # Ahead of the early return below: a scan whose review stage finds
        # nothing usable has still learned which pages a service publishes.
        record_document_changes(service_id, corpus, service_name)

        combined, fetched_urls, corpus_hash = (
            corpus.combined,
            corpus.urls,
            corpus.corpus_hash,
        )
        if not combined:
            self.logger.warning(f"Empty legal corpus for seeds: {tos_urls}")
            return None, False

        self.logger.info(
            f"Corpus assembled: {len(fetched_urls)} pages, {len(combined)} chars, "
            f"hash={corpus_hash[:12]}"
        )

        filtered_corpus = self._filter_complete_pages(combined)
        if not filtered_corpus:
            # An answer, not a failure: the pages were read and judged
            # unusable, and they will read the same until they change.
            self.logger.warning("All corpus pages flagged incomplete")
            return None, True

        catalog = fetch_attribute_catalog()
        current_attributes = fetch_service_attributes(service_id)
        current_attribute_ids = [int(a["id"]) for a in current_attributes]
        listing_record = fetch_service_listing_record(service_id)
        current_kyc_level = service.get("kycLevel")

        result: DeepScanResultType = prompt_deep_scan(
            content=filtered_corpus,
            service_name=service_name,
            attribute_catalog_md=_format_attribute_catalog(catalog),
            current_attribute_ids=current_attribute_ids,
            listing_record=listing_record,
        )

        proposed_edits = self._build_proposed_edits(
            result=result,
            corpus_hash=corpus_hash,
            current_attribute_ids=current_attribute_ids,
            catalog_ids={int(a["id"]) for a in catalog},
            service_id=service_id,
            listing_record=listing_record,
            declined=fetch_scan_declines(service_id),
            current_kyc_level=current_kyc_level,
            corpus=filtered_corpus,
            crawled_keys={page.url_key for page in corpus.pages},
        )

        # A level a reviewer already turned down is not something to decide again.
        kyc_level_changed = bool(proposed_edits["kycPolicy"]["levelFingerprint"])
        if self.only_when_actionable and not _has_actionable_items(
            proposed_edits, kyc_level_changed
        ):
            self.logger.info(
                f"Nothing to propose for service {service_id}, no suggestion created"
            )
            return None, True

        summary_notes = self._build_summary_notes(result, service["kycLevel"])
        return (
            save_deep_scan_proposed_edits(
                service_id=service_id,
                proposed_edits=proposed_edits,
                summary_notes=summary_notes,
            ),
            True,
        )

    def _filter_complete_pages(self, combined: str) -> str:
        """Drop pages flagged incomplete by the fast model before the expensive call."""
        filtered: List[str] = []
        for section in combined.split("===== PAGE: "):
            if not section.strip():
                continue
            section = "===== PAGE: " + section
            try:
                check = prompt_check_tos_review(section)
            except Exception as exc:
                self.logger.warning(
                    f"Completeness check failed: {exc}; keeping section"
                )
                filtered.append(section)
                continue
            if check and check.get("isComplete"):
                filtered.append(section)
            else:
                self.logger.info("Dropping incomplete page from corpus")
        return "\n\n".join(filtered)

    def _build_proposed_edits(
        self,
        result: DeepScanResultType,
        corpus_hash: str,
        current_attribute_ids: List[int],
        catalog_ids: set[int],
        corpus: str,
        service_id: int,
        listing_record: Dict[str, str],
        declined: set,
        current_kyc_level: Optional[int],
        crawled_keys: set,
    ) -> Dict[str, Any]:
        """Sanitize the LLM output and shape it into the proposedEdits payload.

        Drops any attribute proposal whose id is not in the catalog or that
        contradicts the current state (e.g. proposing to add an already-assigned
        attribute, or to remove one that is not assigned). The model is asked
        not to do this in the prompt, but we trust nothing.
        """
        current_set = set(current_attribute_ids)

        def keep_add(item: Dict[str, Any]) -> bool:
            attribute_id = item.get("attributeId")
            return (
                isinstance(attribute_id, int)
                and attribute_id in catalog_ids
                and attribute_id not in current_set
                and is_grounded(str(item.get("quote", "")), corpus)
            )

        def keep_remove(item: Dict[str, Any]) -> bool:
            attribute_id = item.get("attributeId")
            return (
                isinstance(attribute_id, int)
                and attribute_id in catalog_ids
                and attribute_id in current_set
                and is_grounded(str(item.get("quote", "")), corpus)
            )

        attributes_add = [a for a in result["attributesToAdd"] if keep_add(dict(a))]
        attributes_remove = [
            a for a in result["attributesToRemove"] if keep_remove(dict(a))
        ]

        # One proposal per field: two disagreeing about the same column would
        # leave which value gets written to the order they happen to arrive in.
        listing_checks = []
        for check in result["listingChecks"]:
            field = str(check.get("field", ""))
            if field not in LISTING_CHECK_FIELDS:
                continue
            if any(seen["field"] == field for seen in listing_checks):
                self.logger.warning(f"Second proposal for {field}, keeping the first")
                continue
            if not is_grounded(str(check.get("quote", "")), corpus):
                continue

            found = storable_value(field, str(check.get("found", "")))
            if found is None:
                self.logger.warning(
                    f"Cannot store {check.get('found')!r} as {field}, dropping it"
                )
                continue
            if not values_disagree(field, str(listing_record.get(field, "")), found):
                continue

            listing_checks.append({**check, "found": found})

        proposals = self._fingerprint_proposals(
            service_id=service_id,
            attributes_add=attributes_add,
            attributes_remove=attributes_remove,
            listing_checks=listing_checks,
            proposed_kyc_level=(
                result["kycLevel"] if result["kycLevel"] != current_kyc_level else None
            ),
        )
        kept = [item for item in proposals if item["fingerprint"] not in declined]
        dropped = len(proposals) - len(kept)
        if dropped:
            self.logger.info(
                f"Skipping {dropped} proposal(s) a reviewer already declined"
            )

        kept_keys = {(item["kind"], item["key"]) for item in kept}
        kyc_level_proposal = next(
            (item for item in kept if item["kind"] == "kycLevel"), None
        )
        by_fingerprint = {
            (item["kind"], item["key"]): item["fingerprint"] for item in kept
        }

        # Only a page actually crawled can anchor a decline. sourceUrl is written
        # by the model, and the prompt asks for the marker line rather than a
        # bare address, so an unchecked key matches no document. A decline
        # against one never lifts, which would bury a proposal for good the
        # first time a reviewer said no to it.
        def surviving(kind: str, items: List[Dict[str, Any]], key: str) -> List[Dict]:
            out = []
            for item in items:
                identity = (kind, str(item[key]))
                if identity not in kept_keys:
                    continue
                source_key = document_key(str(item.get("sourceUrl", "")))
                if source_key not in crawled_keys:
                    if source_key:
                        self.logger.info(
                            f"Proposal cites an unknown source {source_key!r}; "
                            "declining it will not be remembered against a document"
                        )
                    source_key = ""
                out.append(
                    {
                        **item,
                        "fingerprint": by_fingerprint[identity],
                        "sourceUrlKey": source_key,
                    }
                )
            return out

        attributes_add = surviving("attribute:add", attributes_add, "attributeId")
        attributes_remove = surviving(
            "attribute:remove", attributes_remove, "attributeId"
        )
        listing_checks = surviving("listing", listing_checks, "field")

        return {
            "contentHash": corpus_hash,
            "tosReview": {
                "kycLevel": result["kycLevel"],
                "summary": result["summary"],
                "complexity": result["complexity"],
                "highlights": result["highlights"],
            },
            "kycPolicy": {
                # Present only while the level change is still open. Its absence
                # is what tells the admin form there is nothing to decide here.
                "levelFingerprint": (
                    kyc_level_proposal["fingerprint"] if kyc_level_proposal else None
                ),
                "inferredLevel": result["kycLevel"],
                "notesMd": result["kycPolicyNotesMd"],
                "rationale": result["kycLevelRationale"],
            },
            "attributes": {
                "add": attributes_add,
                "remove": attributes_remove,
            },
            "listingChecks": listing_checks,
            "warnings": result["warnings"],
        }

    def _fingerprint_proposals(
        self,
        service_id: int,
        attributes_add: List[Dict[str, Any]],
        attributes_remove: List[Dict[str, Any]],
        listing_checks: List[Dict[str, Any]],
        proposed_kyc_level: Optional[int],
    ) -> List[Dict[str, Any]]:
        """One identity per discrete proposal a reviewer can turn down."""
        proposals: List[Dict[str, Any]] = []

        for kind, items in (
            ("attribute:add", attributes_add),
            ("attribute:remove", attributes_remove),
        ):
            for item in items:
                key = str(item["attributeId"])
                proposals.append(
                    {
                        "kind": kind,
                        "key": key,
                        "fingerprint": scan_fingerprint(service_id, kind, key),
                    }
                )

        for check in listing_checks:
            proposals.append(
                {
                    "kind": "listing",
                    "key": str(check["field"]),
                    "fingerprint": scan_fingerprint(
                        service_id, "listing", str(check["field"])
                    ),
                }
            )

        # Keyed on the level itself, so turning down a move to 3 says nothing
        # about a later move to 4. The corpus is not part of it: a level is read
        # from every document at once, and there is no single clause to watch.
        if proposed_kyc_level is not None:
            proposals.append(
                {
                    "kind": "kycLevel",
                    "key": str(proposed_kyc_level),
                    "fingerprint": scan_fingerprint(
                        service_id, "kycLevel", str(proposed_kyc_level)
                    ),
                }
            )

        return proposals

    def _build_summary_notes(
        self,
        result: DeepScanResultType,
        old_kyc_level: Optional[int],
    ) -> str:
        new_kyc_level = result["kycLevel"]
        kyc_changed = old_kyc_level is not None and old_kyc_level != new_kyc_level

        lines = [
            "AI-Generated Deep Scan: Requires human review",
            "",
            f"KYC level: {old_kyc_level} -> {new_kyc_level}"
            if kyc_changed
            else f"KYC level: {new_kyc_level} (unchanged)",
            f"Highlights: {len(result['highlights'])}",
            f"Attributes to add: {len(result['attributesToAdd'])}",
            f"Attributes to remove: {len(result['attributesToRemove'])}",
            f"Warnings: {len(result['warnings'])}",
        ]

        if result["summary"]:
            lines += ["", "Summary:", result["summary"]]

        return "\n".join(lines)
