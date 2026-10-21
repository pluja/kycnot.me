"""
Re-checks service affiliations that users claimed with a DNS TXT record. A check that does not find the record counts
as a miss and the user is told; after MAX_FAILED_CHECKS misses in a row, or once the domain was registered again
since the claim, the affiliation is removed. Affiliations staff created have no dnsHost and are never touched.
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Set
from urllib.parse import urlsplit

import dns.exception
import dns.name
import dns.resolver
import requests

from pyworker.database import get_db_connection, run_db_query
from pyworker.tasks.base import Task

# Mirrors web/src/constants/serviceClaim.ts.
CLAIM_RECORD_PREFIX = "kycnotme-verify="
MAX_FAILED_CHECKS = 3

RDAP_BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json"
LOOKUP_TIMEOUT_SECONDS = 8
# A registry may report the same registration with a slightly different timestamp; anything within a day is the same.
REGISTRATION_TOLERANCE = timedelta(days=1)


def claimed_usernames(records: Iterable[str]) -> Set[str]:
    usernames: Set[str] = set()
    for record in records:
        record = record.strip()
        if not record.lower().startswith(CLAIM_RECORD_PREFIX):
            continue
        for name in record[len(CLAIM_RECORD_PREFIX) :].replace(",", " ").split():
            usernames.add(name.lower())
    return usernames


def lookup_txt(host: str) -> Optional[List[str]]:
    """The host's own TXT records; an empty list when the name or its records are gone or the host became a CNAME
    (the answer would then come from whoever holds the target), None when our resolver failed and the check says
    nothing either way."""
    resolver = dns.resolver.Resolver()
    resolver.lifetime = LOOKUP_TIMEOUT_SECONDS
    try:
        answer = resolver.resolve(host, "TXT")
    except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer):
        return []
    except dns.exception.DNSException:
        return None
    if answer.canonical_name != dns.name.from_text(host):
        return []
    return [b"".join(rdata.strings).decode("utf-8", "replace") for rdata in answer]


def _homepage_host(url: str) -> Optional[str]:
    """The ASCII host of a homepage address, normalised the way the claim page reads it, else None."""
    parts = urlsplit(url)
    if (
        parts.scheme not in ("http", "https")
        or parts.path not in ("", "/")
        or parts.query
    ):
        return None
    try:
        return (parts.hostname or "").rstrip(".").encode("idna").decode(
            "ascii"
        ).lower() or None
    except UnicodeError:
        return None


def host_still_listed(host: str, service_urls: Iterable[str]) -> bool:
    return any(_homepage_host(url) in (host, f"www.{host}") for url in service_urls)


class RdapLookup:
    """Registration dates from each registry's RDAP service, found through IANA's bootstrap file."""

    def __init__(self) -> None:
        self._urls_by_tld: Optional[Dict[str, List[str]]] = None

    def _base_urls(self, tld: str) -> List[str]:
        if self._urls_by_tld is None:
            self._urls_by_tld = {}
            try:
                response = requests.get(
                    RDAP_BOOTSTRAP_URL, timeout=LOOKUP_TIMEOUT_SECONDS
                )
                response.raise_for_status()
                for tlds, urls in response.json().get("services", []):
                    for entry in tlds:
                        self._urls_by_tld[entry.lower()] = urls
            except (requests.RequestException, ValueError):
                pass
        return self._urls_by_tld.get(tld, [])

    def registered_at(self, host: str) -> Optional[datetime]:
        labels = host.split(".")
        base_urls = self._base_urls(labels[-1])
        for size in (2, 3):
            if len(labels) < size:
                break
            domain = ".".join(labels[-size:])
            for base_url in base_urls:
                try:
                    response = requests.get(
                        f"{base_url.rstrip('/')}/domain/{domain}",
                        headers={"accept": "application/rdap+json"},
                        timeout=LOOKUP_TIMEOUT_SECONDS,
                    )
                    if not response.ok:
                        continue
                    for event in response.json().get("events", []):
                        if event.get("eventAction") == "registration" and event.get(
                            "eventDate"
                        ):
                            date = datetime.fromisoformat(
                                event["eventDate"].replace("Z", "+00:00")
                            )
                            # The database keeps naive UTC timestamps.
                            return (
                                date.astimezone(timezone.utc).replace(tzinfo=None)
                                if date.tzinfo
                                else date
                            )
                except (requests.RequestException, ValueError):
                    continue
        return None


def changed_hands(
    claimed_registration: Optional[datetime], current_registration: Optional[datetime]
) -> bool:
    if claimed_registration is None or current_registration is None:
        return False
    return current_registration - claimed_registration > REGISTRATION_TOLERANCE


class AffiliationDnsTask(Task):
    def __init__(self) -> None:
        super().__init__("affiliation_dns")
        self.rdap = RdapLookup()

    def run(self) -> Dict[str, Any]:
        rows = run_db_query(
            """
            SELECT su.id, su."userId", su."serviceId", su."dnsHost", su."dnsFailedChecks", su."domainRegisteredAt",
              u.name AS username, s.name AS service_name, s."serviceUrls"
            FROM "ServiceUser" su
            JOIN "User" u ON u.id = su."userId"
            JOIN "Service" s ON s.id = su."serviceId"
            WHERE su."dnsHost" IS NOT NULL
            """
        )
        results = {"confirmed": 0, "missed": 0, "revoked": 0, "skipped": 0}
        for row in rows:
            results[self._check(row)] += 1
        self.logger.info(f"Affiliation DNS check: {results}")
        return results

    def _check(self, row: Dict[str, Any]) -> str:
        host = row["dnsHost"]
        records = lookup_txt(host)
        if records is None:
            return "skipped"

        present = host_still_listed(host, row["serviceUrls"]) and row[
            "username"
        ].lower() in claimed_usernames(records)
        if present and changed_hands(
            row["domainRegisteredAt"], self.rdap.registered_at(host)
        ):
            self._revoke(row, f"{host} was registered again since the claim")
            return "revoked"
        if present:
            self._write(
                'UPDATE "ServiceUser" SET "dnsFailedChecks" = 0, "dnsCheckedAt" = NOW() WHERE id = %s',
                (row["id"],),
            )
            return "confirmed"

        misses = row["dnsFailedChecks"] + 1
        if misses >= MAX_FAILED_CHECKS:
            self._revoke(
                row, f"the DNS record on {host} was missing {misses} checks in a row"
            )
            return "revoked"
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE "ServiceUser" SET "dnsFailedChecks" = %s, "dnsCheckedAt" = NOW()
                    WHERE id = %s AND "dnsHost" IS NOT NULL RETURNING id
                    """,
                    (misses, row["id"]),
                )
                if cursor.fetchone() is None:
                    conn.rollback()
                    return "skipped"
                cursor.execute(
                    """
                    INSERT INTO "Notification" ("userId", type, "aboutServiceId", "createdAt", "updatedAt")
                    VALUES (%s, 'SERVICE_AFFILIATION_CHECK_FAILED', %s, NOW(), NOW())
                    """,
                    (row["userId"], row["serviceId"]),
                )
            conn.commit()
        return "missed"

    def _revoke(self, row: Dict[str, Any], reason: str) -> None:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    'DELETE FROM "ServiceUser" WHERE id = %s AND "dnsHost" IS NOT NULL RETURNING id',
                    (row["id"],),
                )
                if cursor.fetchone() is None:
                    conn.rollback()
                    return
                cursor.execute(
                    """
                    INSERT INTO "Notification" ("userId", type, "aboutServiceId", "createdAt", "updatedAt")
                    VALUES (%s, 'SERVICE_AFFILIATION_REVOKED', %s, NOW(), NOW())
                    """,
                    (row["userId"], row["serviceId"]),
                )
                cursor.execute(
                    """
                    INSERT INTO "AuditLog" ("actorId", action, "targetType", "targetId", summary)
                    VALUES (NULL, 'DELETED', 'USER', %s, %s)
                    """,
                    (
                        row["userId"],
                        f"Removed affiliation with {row['service_name']}: {reason}",
                    ),
                )
            conn.commit()

    def _write(self, command: str, params: tuple) -> None:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(command, params)
            conn.commit()
