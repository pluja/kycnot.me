"""
Closes stale service suggestions that are still pending: suggestions for sites that stopped responding, suggestions
where the team asked something and the author never replied, and new-service suggestions for a service that is
already listed. Suggestions under review are never touched. Each closure posts a message from the support account,
which notifies the author, and is written to the audit log.
"""

import ipaddress
import socket
import threading
from typing import Any, Dict, List, Optional, Set, Tuple
from urllib.parse import SplitResult, urljoin, urlsplit

import requests
import urllib3

from pyworker.database import get_db_connection, run_db_query
from pyworker.tasks.base import Task

SUPPORT_USERNAME = "support"
NO_REPLY_MONTHS = 6
CHECK_INTERVAL_DAYS = 7
# A site counts as dead only after this many weekly checks in a row in which every web address failed.
DEAD_AFTER_CHECKS = 3
CHECKS_PER_RUN = 100
# Before judging anyone's site, a few listed services are checked: if most of them fail too, the fault is on our side
# and the run records nothing. Listed services are used because nobody submitting a suggestion controls them.
CANARY_SITES = 5
MAX_REDIRECTS = 5
MAX_URLS_PER_SITE = 5
LISTED_VISIBILITIES = ("PUBLIC", "ARCHIVED")

Closure = Tuple[int, str, str]


def _split(url: str):
    return urlsplit(url.strip() if "://" in url else f"https://{url.strip()}")


def host_of(url: str) -> Optional[str]:
    """The lowercase host without "www.", or None for anything that is not a web address."""
    parts = _split(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        return None
    host = parts.hostname.lower()
    if host.endswith((".onion", ".i2p")):
        return None
    return host[4:] if host.startswith("www.") else host


def site_key(url: str) -> Optional[str]:
    """What makes two links the same site: the host for a homepage, the whole address for a page on a shared
    platform such as t.me/somebot or github.com/org, where the host alone says nothing."""
    host = host_of(url)
    if not host:
        return None
    parts = _split(url)
    path = parts.path.rstrip("/").lower()
    if not path and not parts.query:
        return host
    return f"{host}{path}?{parts.query}" if parts.query else f"{host}{path}"


USER_AGENT = "Mozilla/5.0 (compatible; KYCnotme-checker)"
# A whole check, redirects included, gets this long; a server that drips its headers then says nothing either way.
CHECK_DEADLINE_SECONDS = 60
# Only these resolver errors mean the name is gone; anything else is our resolver failing.
_NAME_GONE_ERRORS = {
    socket.EAI_NONAME,
    getattr(socket, "EAI_NODATA", socket.EAI_NONAME),
}
_CONNECTION_FAILURES = (
    urllib3.exceptions.NewConnectionError,
    urllib3.exceptions.ConnectTimeoutError,
    urllib3.exceptions.ReadTimeoutError,
    urllib3.exceptions.ProtocolError,
    urllib3.exceptions.SSLError,
)


def fetch_status(parts: SplitResult, address: str) -> Tuple[int, Optional[str]]:
    """The status and Location of a GET to parts, connecting to address rather than resolving the name again, so the
    address that was checked is the one requested. Sends Host and SNI for the name, reads no body and ignores any proxy
    set in the environment."""
    https = parts.scheme == "https"
    port = parts.port or (443 if https else 80)
    host = parts.hostname or ""
    tls = (
        {
            "cert_reqs": "CERT_REQUIRED",
            "ca_certs": requests.certs.where(),
            "server_hostname": host,
            "assert_hostname": host,
        }
        if https
        else {}
    )
    pool_class = urllib3.HTTPSConnectionPool if https else urllib3.HTTPConnectionPool
    with pool_class(
        address,
        port,
        timeout=urllib3.Timeout(connect=10, read=20),
        retries=False,
        **tls,
    ) as pool:
        response = pool.urlopen(
            "GET",
            (parts.path or "/") + (f"?{parts.query}" if parts.query else ""),
            headers={"Host": parts.netloc.rsplit("@", 1)[-1], "User-Agent": USER_AGENT},
            redirect=False,
            preload_content=False,
        )
        status, location = response.status, response.headers.get("Location")
        response.close()
    return status, location


def _check(url: str) -> Optional[bool]:
    for _ in range(MAX_REDIRECTS + 1):
        parts = urlsplit(url)
        if parts.scheme not in ("http", "https") or not parts.hostname:
            return None
        try:
            addresses = [
                str(info[4][0]).split("%")[0]
                for info in socket.getaddrinfo(
                    parts.hostname, None, type=socket.SOCK_STREAM
                )
            ]
        except socket.gaierror as error:
            return True if error.errno in _NAME_GONE_ERRORS else None
        if not addresses or not all(
            ipaddress.ip_address(a).is_global for a in addresses
        ):
            return None
        try:
            status, location = fetch_status(parts, addresses[0])
        except _CONNECTION_FAILURES:
            return True
        except urllib3.exceptions.HTTPError:
            return None
        if 300 <= status < 400 and location:
            url = urljoin(url, location)
            continue
        # Bot walls and rate limits answer with 4xx while the site is alive.
        return status in (404, 410) or status >= 500
    return None


def site_is_down(url: str) -> Optional[bool]:
    """True when the site is gone, False when it answers, None when the check says nothing either way.

    The URLs come from users, so redirects are followed by hand, no request goes to a private address, and a check
    that runs past its deadline or trips over a malformed address counts as no answer rather than stopping the run.
    """
    outcome: List[Optional[bool]] = [None]

    def run() -> None:
        try:
            outcome[0] = _check(url)
        except (ValueError, UnicodeError):
            outcome[0] = None

    thread = threading.Thread(target=run, daemon=True)
    thread.start()
    thread.join(CHECK_DEADLINE_SECONDS)
    return None if thread.is_alive() else outcome[0]


def web_urls(urls: List[str]) -> List[str]:
    return [url for url in urls if host_of(url)]


class SuggestionCleanupTask(Task):
    def __init__(self, dry_run: bool = False):
        super().__init__("suggestion_cleanup")
        self.dry_run = dry_run

    def run(self) -> Dict[str, Any]:
        # Only a staff account may speak for the team; anyone could register the name otherwise.
        sender = run_db_query(
            """
            SELECT id FROM "User"
            WHERE name = %s AND (admin OR 'suggestions:manage' = ANY(capabilities))
            """,
            (SUPPORT_USERNAME,),
        )
        if not sender:
            raise RuntimeError(
                f"The {SUPPORT_USERNAME} account is missing or is not staff"
            )
        sender_id = sender[0]["id"]

        sites = self._check_sites()
        closures: List[Closure] = []
        seen: Set[int] = set()
        for rule in (
            self._dead_sites,
            self._no_reply,
            self._already_listed,
            self._same_domain,
        ):
            for closure in rule():
                if closure[0] not in seen:
                    seen.add(closure[0])
                    closures.append(closure)

        closed = 0
        for suggestion_id, reason, message in closures:
            if self.dry_run:
                self.logger.info(f"Would close suggestion {suggestion_id}: {reason}")
                continue
            closed += self._close(suggestion_id, sender_id, reason, message)

        by_reason: Dict[str, int] = {}
        for _, reason, _ in closures:
            by_reason[reason] = by_reason.get(reason, 0) + 1
        results = {
            "dry_run": self.dry_run,
            "sites": sites,
            "closed": closed,
            "by_reason": by_reason,
        }
        self.logger.info(f"Suggestion cleanup: {results}")
        return results

    def _network_is_up(self) -> bool:
        rows = run_db_query(
            """
            SELECT "serviceUrls" FROM "Service"
            WHERE "serviceVisibility" = 'PUBLIC'
            ORDER BY random()
            LIMIT %s
            """,
            (CANARY_SITES,),
        )
        urls = [
            web_urls(row["serviceUrls"])[0]
            for row in rows
            if web_urls(row["serviceUrls"])
        ]
        if not urls:
            return True
        answered = sum(1 for url in urls if site_is_down(url) is False)
        return answered * 2 >= len(urls)

    def _check_sites(self) -> Dict[str, int]:
        """Checks the sites of pending new-service suggestions not checked this week and records the outcome."""
        if not self._network_is_up():
            self.logger.warning(
                "Most listed services failed too; recording nothing this run"
            )
            return {"checked": 0, "down": 0, "recorded": 0}
        services = run_db_query(
            f"""
            SELECT DISTINCT sv.id, sv."serviceUrls", sv."reachabilityCheckedAt"
            FROM "Service" sv JOIN "ServiceSuggestion" s ON s."serviceId" = sv.id
            WHERE s.status = 'PENDING' AND s.type = 'CREATE_SERVICE'
              AND (sv."reachabilityCheckedAt" IS NULL
                OR sv."reachabilityCheckedAt" < NOW() - INTERVAL '{CHECK_INTERVAL_DAYS} days')
            ORDER BY sv."reachabilityCheckedAt" NULLS FIRST, sv.id
            LIMIT {CHECKS_PER_RUN}
            """
        )
        outcomes: List[Tuple[int, bool]] = []
        for service in services:
            urls = web_urls(service["serviceUrls"])[:MAX_URLS_PER_SITE]
            if not urls:
                continue
            checks = [site_is_down(url) for url in urls]
            if False in checks:
                outcomes.append((service["id"], False))
            elif all(check is True for check in checks):
                outcomes.append((service["id"], True))
        down = sum(1 for _, is_down in outcomes if is_down)
        summary = {"checked": len(outcomes), "down": down, "recorded": 0}
        if self.dry_run or not outcomes:
            return summary
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                for service_id, is_down in outcomes:
                    cursor.execute(
                        """
                        UPDATE "Service" SET
                          "unreachableChecks" = CASE WHEN %s THEN "unreachableChecks" + 1 ELSE 0 END,
                          "reachabilityCheckedAt" = NOW()
                        WHERE id = %s
                        """,
                        (is_down, service_id),
                    )
            conn.commit()
        summary["recorded"] = len(outcomes)
        return summary

    def _dead_sites(self) -> List[Closure]:
        rows = run_db_query(
            """
            SELECT s.id, sv.name, sv."serviceUrls"
            FROM "ServiceSuggestion" s JOIN "Service" sv ON sv.id = s."serviceId"
            WHERE s.status = 'PENDING' AND s.type = 'CREATE_SERVICE' AND sv."unreachableChecks" >= %s
            ORDER BY s.id
            """,
            (DEAD_AFTER_CHECKS,),
        )
        return [
            (
                row["id"],
                "dead site",
                f"We tried to reach {row['name']} at {', '.join(host_of(url) or url for url in web_urls(row['serviceUrls']))}"
                f" several times over at least {(DEAD_AFTER_CHECKS - 1) * CHECK_INTERVAL_DAYS} days, and it no longer"
                " responds, so we're closing this suggestion. If the site comes back, you're welcome to suggest it"
                " again.",
            )
            for row in rows
        ]

    def _no_reply(self) -> List[Closure]:
        rows = run_db_query(
            f"""
            WITH last AS (
              SELECT DISTINCT ON ("suggestionId") "suggestionId", "userId", "createdAt"
              FROM "ServiceSuggestionMessage"
              ORDER BY "suggestionId", "createdAt" DESC, id DESC
            )
            SELECT s.id
            FROM "ServiceSuggestion" s
            JOIN last ON last."suggestionId" = s.id
            JOIN "User" u ON u.id = last."userId"
            WHERE s.status = 'PENDING'
              AND last."userId" <> s."userId"
              AND (u.admin OR 'suggestions:manage' = ANY(u.capabilities))
              AND last."createdAt" < NOW() - INTERVAL '{NO_REPLY_MONTHS} months'
            ORDER BY s.id
            """
        )
        return [
            (
                row["id"],
                "no reply",
                f"We asked you something about this suggestion {NO_REPLY_MONTHS} months ago and haven't heard back,"
                " so we're closing it. If you'd still like it reviewed, please open a new suggestion with the details.",
            )
            for row in rows
        ]

    def _already_listed(self) -> List[Closure]:
        rows = run_db_query(
            """
            SELECT s.id, sv.name, sv.slug
            FROM "ServiceSuggestion" s JOIN "Service" sv ON sv.id = s."serviceId"
            WHERE s.status = 'PENDING' AND s.type = 'CREATE_SERVICE'
              AND sv."serviceVisibility"::text = ANY(%s)
            ORDER BY s.id
            """,
            (list(LISTED_VISIBILITIES),),
        )
        return [
            (
                row["id"],
                "already listed",
                f"{row['name']} is already listed at kycnot.me/service/{row['slug']}, so we're closing this"
                " suggestion. Thanks for suggesting it. If something on the listing is wrong, suggest an edit"
                " from its page.",
            )
            for row in rows
        ]

    def _same_domain(self) -> List[Closure]:
        listed = run_db_query(
            """
            SELECT id, name, slug, "serviceUrls" FROM "Service"
            WHERE "serviceVisibility"::text = ANY(%s)
            """,
            (list(LISTED_VISIBILITIES),),
        )
        by_key: Dict[str, Dict[str, Any]] = {}
        for service in listed:
            for url in service["serviceUrls"]:
                key = site_key(url)
                if key:
                    by_key.setdefault(key, service)
        pending = run_db_query(
            """
            SELECT s.id, s."serviceId", sv."serviceUrls"
            FROM "ServiceSuggestion" s JOIN "Service" sv ON sv.id = s."serviceId"
            WHERE s.status = 'PENDING' AND s.type = 'CREATE_SERVICE'
            ORDER BY s.id
            """
        )
        closures: List[Closure] = []
        for suggestion in pending:
            match = next(
                (
                    by_key[key]
                    for key in filter(
                        None, (site_key(url) for url in suggestion["serviceUrls"])
                    )
                    if key in by_key and by_key[key]["id"] != suggestion["serviceId"]
                ),
                None,
            )
            if match:
                closures.append(
                    (
                        suggestion["id"],
                        "same domain as a listed service",
                        f"{match['name']} is already listed at kycnot.me/service/{match['slug']} with the same"
                        " website, so we're closing this suggestion as a duplicate. If the listing is missing"
                        " something, suggest an edit from its page.",
                    )
                )
        return closures

    def _close(
        self, suggestion_id: int, sender_id: int, reason: str, message: str
    ) -> int:
        """Withdraws a suggestion that is still pending and posts the message; returns 1 when it closed."""
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE "ServiceSuggestion" SET status = 'WITHDRAWN', "updatedAt" = NOW()
                    WHERE id = %s AND status = 'PENDING' RETURNING id
                    """,
                    (suggestion_id,),
                )
                if cursor.fetchone() is None:
                    conn.rollback()
                    return 0
                cursor.execute(
                    """
                    INSERT INTO "ServiceSuggestionMessage" (content, "userId", "suggestionId", "updatedAt")
                    VALUES (%s, %s, %s, NOW())
                    """,
                    (message, sender_id, suggestion_id),
                )
                cursor.execute(
                    """
                    INSERT INTO "AuditLog" ("actorId", action, "targetType", "targetId", summary)
                    VALUES (%s, 'STATUS_CHANGED', 'SERVICE_SUGGESTION', %s, %s)
                    """,
                    (sender_id, suggestion_id, f"Withdrew automatically: {reason}"),
                )
            conn.commit()
        return 1
