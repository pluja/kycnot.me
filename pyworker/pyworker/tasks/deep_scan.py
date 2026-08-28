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
    DeepScanResultType,
    fetch_attribute_catalog,
    fetch_service_attributes,
    fetch_service_for_deep_scan,
    save_deep_scan_proposed_edits,
)
from pyworker.tasks.base import Task
from pyworker.utils.ai import (
    prompt_check_tos_review,
    prompt_deep_scan,
)
from pyworker.utils.crawl import fetch_legal_corpus


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
                f"- id={attribute['id']} type={attribute['type']} title=\"{attribute['title']}\""
                f"{description_part}"
            )
        lines.append("")
    return "\n".join(lines).strip()


class DeepScanTask(Task):
    """Admin-triggered deep scan of a service's legal corpus."""

    def __init__(self):
        super().__init__("deep_scan")

    def run(self, service_id: int) -> Optional[int]:
        """Run a deep scan for the given service.

        Returns the new ServiceSuggestion id, or None if nothing was produced.
        """
        service = fetch_service_for_deep_scan(service_id)
        if service is None:
            self.logger.error(f"Service {service_id} not found, skipping deep scan")
            return None

        service_name = service["name"]
        tos_urls: List[str] = list(service.get("tosUrls") or [])

        if not tos_urls:
            self.logger.warning(
                f"Service {service_name} (ID: {service_id}) has no tosUrls, skipping deep scan"
            )
            return None

        self.logger.info(
            f"Deep-scanning service: {service_name} (ID: {service_id}); seeds={tos_urls}"
        )

        corpus = fetch_legal_corpus(tos_urls)
        combined, fetched_urls, corpus_hash = corpus.combined, corpus.urls, corpus.corpus_hash
        if not combined:
            self.logger.warning(f"Empty legal corpus for seeds: {tos_urls}")
            return None

        self.logger.info(
            f"Corpus assembled: {len(fetched_urls)} pages, {len(combined)} chars, "
            f"hash={corpus_hash[:12]}"
        )

        filtered_corpus = self._filter_complete_pages(combined)
        if not filtered_corpus:
            self.logger.warning("All corpus pages flagged incomplete")
            return None

        catalog = fetch_attribute_catalog()
        current_attributes = fetch_service_attributes(service_id)
        current_attribute_ids = [int(a["id"]) for a in current_attributes]

        result: DeepScanResultType = prompt_deep_scan(
            content=filtered_corpus,
            service_name=service_name,
            attribute_catalog_md=_format_attribute_catalog(catalog),
            current_attribute_ids=current_attribute_ids,
        )

        proposed_edits = self._build_proposed_edits(
            result=result,
            corpus_hash=corpus_hash,
            current_attribute_ids=current_attribute_ids,
            catalog_ids={int(a["id"]) for a in catalog},
        )

        summary_notes = self._build_summary_notes(result, service["kycLevel"])
        return save_deep_scan_proposed_edits(
            service_id=service_id,
            proposed_edits=proposed_edits,
            summary_notes=summary_notes,
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
            )

        def keep_remove(item: Dict[str, Any]) -> bool:
            attribute_id = item.get("attributeId")
            return (
                isinstance(attribute_id, int)
                and attribute_id in catalog_ids
                and attribute_id in current_set
            )

        attributes_add = [a for a in result["attributesToAdd"] if keep_add(dict(a))]
        attributes_remove = [
            a for a in result["attributesToRemove"] if keep_remove(dict(a))
        ]

        return {
            "contentHash": corpus_hash,
            "tosReview": {
                "kycLevel": result["kycLevel"],
                "summary": result["summary"],
                "complexity": result["complexity"],
                "highlights": result["highlights"],
            },
            "kycPolicy": {
                "inferredLevel": result["kycLevel"],
                "notesMd": result["kycPolicyNotesMd"],
                "rationale": result["kycLevelRationale"],
            },
            "attributes": {
                "add": attributes_add,
                "remove": attributes_remove,
            },
            "warnings": result["warnings"],
        }

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
