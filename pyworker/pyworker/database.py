"""
Database operations for the pyworker package.
"""

import hashlib
import json
import secrets
import string
from contextlib import contextmanager
from typing import Any, Dict, Generator, List, Optional, TypedDict, Union
from typing import Literal as TypeLiteral

import psycopg
from psycopg.rows import dict_row
from psycopg.sql import SQL, Composed, Literal
from psycopg_pool import ConnectionPool  # Proper import for the connection pool

from pyworker.config import config
import logging

logger = logging.getLogger(__name__)

# --- Type Definitions ---


# Moved from utils/ai.py
RatingType = TypeLiteral["info", "warning", "alert"]


class UserRightType(TypedDict):
    text: str
    rating: RatingType


class DataSharingType(TypedDict):
    text: str
    rating: RatingType


class DataCollectedType(TypedDict):
    text: str
    rating: RatingType


class KycOrSourceOfFundsType(TypedDict):
    text: str
    rating: RatingType


class DeepScanAttributeProposalType(TypedDict):
    attributeId: int
    rationale: str


class DeepScanWarningType(TypedDict):
    title: str
    bodyMd: str
    severity: TypeLiteral["info", "warning", "alert"]


class DescriptionResultType(TypedDict):
    verdict: str
    description: str
    reasons: List[str]


class DeepScanResultType(TypedDict):
    """Raw structured output from the deep scan LLM call."""

    kycLevel: int
    summary: str
    complexity: TypeLiteral["low", "medium", "high"]
    highlights: List[Dict[str, Any]]
    kycPolicyNotesMd: str
    kycLevelRationale: str
    attributesToAdd: List[DeepScanAttributeProposalType]
    attributesToRemove: List[DeepScanAttributeProposalType]
    warnings: List[DeepScanWarningType]


class CommentModerationType(TypedDict):
    postKind: TypeLiteral["EXPERIENCE", "DISCUSSION", "UNCLASSIFIED"]
    experienceSentiment: Optional[TypeLiteral["POSITIVE", "NEUTRAL", "NEGATIVE"]]
    recommendedAction: TypeLiteral["approve", "reject", "human_review"]
    reasoning: str
    commentQuality: int
    isSpam: bool
    isBrigade: bool
    brigadeConfidence: int
    rejectionRule: Optional[str]
    rejectionConfident: bool
    looksGenerated: bool


QueryType = Union[str, bytes, SQL, Composed, Literal]


# --- Database Connection Pool ---
_db_pool: Optional[ConnectionPool] = None


def get_db_pool() -> ConnectionPool:
    """
    Get or create the database connection pool.

    Returns:
        A connection pool object.
    """
    global _db_pool
    if _db_pool is None:
        try:
            # Create a new connection pool with min connections of 2 and max of 10
            _db_pool = ConnectionPool(
                conninfo=config.db_connection_string,
                min_size=2,
                max_size=10,
                # Configure how connections are initialized
                kwargs={
                    "autocommit": False,
                },
            )
            logger.info("Database connection pool initialized")
        except Exception as e:
            logger.error(f"Error creating database connection pool: {e}")
            raise
    return _db_pool


def close_db_pool():
    """
    Close the database connection pool.
    This should be called when the application is shutting down.
    """
    global _db_pool
    if _db_pool is not None:
        logger.info("Closing database connection pool")
        _db_pool.close()
        _db_pool = None


@contextmanager
def get_db_connection() -> Generator[psycopg.Connection, None, None]:
    """
    Context manager for database connections.

    Yields:
        A database connection object from the pool.
    """
    pool = get_db_pool()
    try:
        # Use the connection method which returns a connection as a context manager
        with pool.connection() as conn:
            # Set the schema explicitly after connection
            with conn.cursor() as cursor:
                cursor.execute("SET search_path TO public")
            yield conn
            # The connection will be automatically returned to the pool
            # when the with block exits
    except Exception as e:
        logger.error(f"Error connecting to the database: {e}")
        raise


# --- Bot User ---

_bot_user_id: Optional[int] = None


def _generate_feed_id() -> str:
    """Generate a feed id for raw SQL user inserts.

    Prisma fills feedId with cuid(2), but pyworker creates the bot user through
    psycopg, so the application-level Prisma default never runs.
    """
    alphabet = string.ascii_lowercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(24))


def ensure_bot_user() -> int:
    """
    Get or create the bot user that PyWorker uses to author edit suggestions.

    The user is looked up by name (from config.BOT_USERNAME). If it doesn't
    exist, a new row is inserted with a random secret token hash (the token
    itself is discarded: bot accounts don't log in through the web UI).

    Returns:
        The bot user's database ID.
    """
    global _bot_user_id
    if _bot_user_id is not None:
        return _bot_user_id

    username = config.BOT_USERNAME

    try:
        with get_db_connection() as conn:
            with conn.cursor(row_factory=dict_row) as cursor:
                # Try to find existing bot user
                cursor.execute(
                    'SELECT id FROM "User" WHERE name = %s',
                    (username,),
                )
                row = cursor.fetchone()

                if row is not None:
                    _bot_user_id = int(row["id"])
                    logger.info(
                        f"Found existing bot user '{username}' (ID: {_bot_user_id})"
                    )
                    return _bot_user_id

                row = None
                for _ in range(5):
                    random_token = secrets.token_hex(32)
                    token_hash = hashlib.sha512(random_token.encode()).hexdigest()
                    try:
                        cursor.execute(
                            """
                            INSERT INTO "User" (
                                name,
                                "secretTokenHash",
                                "feedId",
                                "createdAt",
                                "updatedAt",
                                "lastLoginAt"
                            )
                            VALUES (%s, %s, %s, NOW(), NOW(), NOW())
                            ON CONFLICT (name) DO NOTHING
                            RETURNING id
                            """,
                            (username, token_hash, _generate_feed_id()),
                        )
                        row = cursor.fetchone()
                        if row is not None:
                            conn.commit()
                            break

                        cursor.execute(
                            'SELECT id FROM "User" WHERE name = %s',
                            (username,),
                        )
                        row = cursor.fetchone()
                        if row is not None:
                            break
                    except psycopg.errors.UniqueViolation:
                        conn.rollback()
                        continue

                if row is None:
                    raise RuntimeError(f"Could not create bot user '{username}'")

                assert row is not None, "Bot user lookup should always return a row"
                _bot_user_id = int(row["id"])
                logger.info(f"Using bot user '{username}' (ID: {_bot_user_id})")
                return _bot_user_id
    except Exception as e:
        logger.error(f"Error ensuring bot user '{username}': {e}")
        raise


# --- Edit Suggestions ---


def fetch_all_services() -> List[Dict[str, Any]]:
    """
    Fetch all public and verified services from the database.

    Returns:
        A list of service dictionaries.
    """
    services = []
    try:
        with get_db_connection() as conn:
            with conn.cursor(row_factory=dict_row) as cursor:
                cursor.execute("""
                    SELECT id, name, slug, description, "kycLevel", "overallScore", 
                        "privacyScore", "trustScore", "verificationStatus", 
                        "serviceVisibility", "tosUrls", "serviceUrls", "onionUrls", "i2pUrls", 
                        "tosReview", "tosReviewAt"
                    FROM "Service"
                    WHERE "serviceVisibility" = 'PUBLIC'
                        AND ("verificationStatus" = 'VERIFICATION_SUCCESS' 
                        OR "verificationStatus" = 'COMMUNITY_CONTRIBUTED' 
                        OR "verificationStatus" = 'APPROVED')
                    ORDER BY id
                """)
                services = cursor.fetchall()
                logger.info(f"Fetched {len(services)} services from the database")
    except Exception as e:
        logger.error(f"Error fetching services: {e}")

    return services


def fetch_services_with_pending_comments() -> List[Dict[str, Any]]:
    """
    Fetch every service that has at least one comment awaiting AI review.

    Deliberately unfiltered by serviceVisibility / verificationStatus: comment
    moderation judges the comment, not the service's listing state. Users can
    still comment on unlisted, archived, hidden, or verification-failed
    services, and those comments must be moderated too. Filtering them out here
    leaves them PENDING with no AI verdict forever, so they never surface in the
    moderator queue.

    Matches get_pending_comments(): only services with an un-reviewed,
    human-untouched comment, so the worker does not wake for services whose only
    pending rows are already held or decided.

    Returns:
        A list of service dictionaries.
    """
    services = []
    try:
        with get_db_connection() as conn:
            with conn.cursor(row_factory=dict_row) as cursor:
                cursor.execute("""
                    SELECT DISTINCT s.id, s.name, s.slug, s.description, s."kycLevel", s."overallScore",
                        s."privacyScore", s."trustScore", s."verificationStatus",
                        s."serviceVisibility", s."tosUrls", s."serviceUrls", s."onionUrls", s."i2pUrls",
                        s."tosReview", s."tosReviewAt"
                    FROM "Service" s
                    JOIN "Comment" c ON s.id = c."serviceId"
                    WHERE (c.status = 'PENDING' AND c."aiDecidedAt" IS NULL AND c."humanAction" IS NULL)
                       OR EXISTS (
                           SELECT 1 FROM "CommentRevision" r
                           WHERE r."commentId" = c.id AND r.status = 'PENDING'
                             AND r."aiDecidedAt" IS NULL AND r."redactedAt" IS NULL
                       )
                    ORDER BY s.id
                """)
                services = cursor.fetchall()
                logger.info(
                    f"Fetched {len(services)} services with pending comments from the database"
                )
    except Exception as e:
        logger.error(f"Error fetching services with pending comments: {e}")

    return services


def fetch_attribute_catalog() -> List[Dict[str, Any]]:
    """Fetch every attribute the platform tracks (id, slug, title, description, category, type)."""
    attributes: List[Dict[str, Any]] = []
    try:
        with get_db_connection() as conn:
            with conn.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT id, slug, title, description, category, type
                    FROM "Attribute"
                    ORDER BY category, type, title
                    """
                )
                attributes = cursor.fetchall()
    except Exception as e:
        logger.error(f"Error fetching attribute catalog: {e}")
    return attributes


def fetch_service_for_deep_scan(service_id: int) -> Optional[Dict[str, Any]]:
    """Fetch the fields needed to run a deep scan for a single service.

    Returns None if the service does not exist.
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT s.id, s.name, s.slug, s.description, s."kycLevel",
                           s."kycPolicyMd", s."verificationStatus",
                           s."serviceVisibility", s."tosUrls", s."serviceUrls",
                           s."tosReview",
                           (SELECT array_agg(c.name ORDER BY c.name)
                              FROM "_ServiceToCategory" cs
                              JOIN "Category" c ON c.id = cs."A"
                             WHERE cs."B" = s.id) AS categories
                    FROM "Service" s
                    WHERE s.id = %s
                    """,
                    (service_id,),
                )
                return cursor.fetchone()
    except Exception as e:
        logger.error(f"Error fetching service {service_id} for deep scan: {e}")
        return None


def claim_next_scan_job() -> Optional[Dict[str, Any]]:
    """Atomically claim the next pending ServiceScanJob.

    The claim is durable: claimedAt is set in the same transaction that selects
    the row, so another worker cannot pick the same scan after the lock is
    released. Jobs with very old claims can be retried if a worker died.

    Returns the job row (id, serviceId, requestedByUserId, kind) or None if the
    queue is empty.
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    WITH next_job AS (
                        SELECT id
                        FROM "ServiceScanJob"
                        WHERE "processedAt" IS NULL
                          AND (
                            "claimedAt" IS NULL
                            OR "claimedAt" < NOW() - (%s * INTERVAL '1 minute')
                          )
                        ORDER BY "createdAt" ASC
                        LIMIT 1
                        FOR UPDATE SKIP LOCKED
                    )
                    UPDATE "ServiceScanJob" AS job
                    SET "claimedAt" = NOW(), "error" = NULL
                    FROM next_job
                    WHERE job.id = next_job.id
                    RETURNING job.id, job."serviceId", job."requestedByUserId", job.kind
                    """,
                    (config.SERVICE_SCAN_CLAIM_TIMEOUT_MINUTES,),
                )
                job = cursor.fetchone()
                conn.commit()
                return job
    except Exception as e:
        logger.error(f"Error claiming next scan job: {e}")
        return None


def mark_scan_job_done(job_id: int, error: Optional[str] = None) -> None:
    """Mark a ServiceScanJob as processed, recording an error message on failure."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE "ServiceScanJob"
                    SET "processedAt" = NOW(), "error" = %s
                    WHERE id = %s
                    """,
                    (error, job_id),
                )
                conn.commit()
                logger.info(
                    f"Scan job {job_id} marked done"
                    + (f" with error: {error}" if error else "")
                )
    except Exception as e:
        logger.error(f"Error marking scan job {job_id} done: {e}")


# Fields whose value the legal documents can speak to plainly. Every field added
# here widens what the scanner may raise, so it grows only when a field earns it.
LISTING_CHECK_FIELDS = ("registrationCountryCode", "registeredCompanyName")


def fetch_service_listing_record(service_id: int) -> Dict[str, str]:
    """The platform's own record of a service, for the scanner to compare against."""
    columns = ", ".join(f'"{field}"' for field in LISTING_CHECK_FIELDS)
    try:
        with get_db_connection() as conn:
            with conn.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    f'SELECT {columns} FROM "Service" WHERE id = %s', (service_id,)
                )
                row = cursor.fetchone()
                return {k: (v or "") for k, v in (row or {}).items()}
    except Exception as e:
        logger.error(f"Error loading listing record for service {service_id}: {e}")
        return {}


def fetch_scan_declines(service_id: int) -> set:
    """Proposals turned down whose source document still reads as it did.

    A decline lifts only when the page it was drawn from changes, so editing a
    fee table cannot reopen a question answered from the terms. One with no
    source document never lifts.
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT d.fingerprint
                    FROM "ServiceScanDecline" d
                    LEFT JOIN "ServiceLegalDocument" doc
                      ON doc."serviceId" = d."serviceId"
                     AND doc."urlKey" = d."sourceUrlKey"
                    WHERE d."serviceId" = %s
                      AND (
                        d."sourceUrlKey" IS NULL
                        OR doc."contentHash" IS NULL
                        OR doc."contentHash" = d."sourceContentHash"
                      )
                    """,
                    (service_id,),
                )
                return {row["fingerprint"] for row in cursor.fetchall()}
    except Exception as e:
        logger.error(f"Error loading scan declines for service {service_id}: {e}")
        return set()


def fetch_services_needing_scan(limit: int) -> List[Dict[str, Any]]:
    """Services whose legal documents moved since a scan last looked at them.

    Decided from recorded document changes rather than by crawling, so a sweep
    costs one query and then crawls only the services that actually changed.
    The limit is what staggers the first pass, where every service qualifies
    because none has been scanned yet.

    Ordered by when each was last tried rather than when one last succeeded, so
    a service whose scan keeps failing stays eligible without taking a slot from
    everything else every night.
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT s.id, s.name, s.slug, s."tosChangedAt", s."lastLegalScanAt"
                    FROM "Service" s
                    WHERE s."serviceVisibility" = 'PUBLIC'
                      AND s."verificationStatus" IN ('VERIFICATION_SUCCESS', 'APPROVED')
                      AND array_length(s."tosUrls", 1) > 0
                      AND (
                        s."lastLegalScanAt" IS NULL
                        OR (
                          s."tosChangedAt" IS NOT NULL
                          AND s."tosChangedAt" > s."lastLegalScanAt"
                        )
                      )
                    ORDER BY s."lastLegalScanAttemptAt" ASC NULLS FIRST, s.id
                    LIMIT %s
                    """,
                    (limit,),
                )
                return list(cursor.fetchall())
    except Exception as e:
        logger.error(f"Error selecting services needing a scan: {e}")
        return []


def mark_service_scan_attempted(service_id: int) -> None:
    """Record that a scan tried, whatever came of it.

    Kept apart from the stamp below so a scan that fails is still known to have
    run. The sweep takes the least recently tried first, so a service failing
    every night waits its turn rather than holding a slot, and a service that
    failed once is looked at again instead of waiting for its documents to move.
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    'UPDATE "Service" SET "lastLegalScanAttemptAt" = NOW() WHERE id = %s',
                    (service_id,),
                )
                conn.commit()
    except Exception as e:
        logger.error(f"Error stamping scan attempt for service {service_id}: {e}")


def mark_service_scanned(service_id: int) -> None:
    """Record that a scan read this service's documents through to an answer."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    'UPDATE "Service" SET "lastLegalScanAt" = NOW() WHERE id = %s',
                    (service_id,),
                )
                conn.commit()
    except Exception as e:
        logger.error(f"Error stamping scan time for service {service_id}: {e}")


def save_deep_scan_proposed_edits(
    service_id: int,
    proposed_edits: Dict[str, Any],
    summary_notes: str,
) -> Optional[int]:
    """Insert a ServiceSuggestion carrying the bot's proposed edits.

    Returns the new suggestion id, or None on failure.
    """
    bot_user_id = ensure_bot_user()
    edits_json = json.dumps(proposed_edits)

    try:
        with get_db_connection() as conn:
            with conn.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    INSERT INTO "ServiceSuggestion"
                        (type, status, notes, "proposedEdits", "userId", "serviceId", "createdAt", "updatedAt")
                    VALUES ('EDIT_SERVICE', 'PENDING', %s, %s::jsonb, %s, %s, NOW(), NOW())
                    RETURNING id
                    """,
                    (summary_notes, edits_json, bot_user_id, service_id),
                )
                row = cursor.fetchone()
                suggestion_id = row["id"] if row else None
                withdrawn_rows = []
                if suggestion_id:
                    cursor.execute(
                        """
                        UPDATE "ServiceSuggestion"
                        SET
                            status = 'WITHDRAWN',
                            "assignedToId" = NULL,
                            "assignedAt" = NULL,
                            notes = CASE
                                WHEN notes IS NULL OR notes = '' THEN %s
                                ELSE notes || E'\n\n' || %s
                            END,
                            "updatedAt" = NOW()
                        WHERE "serviceId" = %s
                          AND id <> %s
                          AND "proposedEdits" IS NOT NULL
                          AND status IN ('PENDING', 'UNDER_REVIEW')
                          AND (%s OR NOT ("proposedEdits" ? 'tosReview'))
                        RETURNING id
                        """,
                        (
                            f"Withdrawn automatically: newer deep scan suggestion #{suggestion_id} created.",
                            f"Withdrawn automatically: newer deep scan suggestion #{suggestion_id} created.",
                            service_id,
                            suggestion_id,
                            "tosReview" in proposed_edits,
                        ),
                    )
                    withdrawn_rows = cursor.fetchall()
                conn.commit()
                if suggestion_id:
                    logger.info(
                        f"Created deep scan suggestion #{suggestion_id} for service {service_id}"
                    )
                    if withdrawn_rows:
                        logger.info(
                            f"Withdrew {len(withdrawn_rows)} older deep scan suggestion(s) "
                            f"for service {service_id}"
                        )
                return suggestion_id
    except Exception as e:
        logger.error(
            f"Error creating deep scan suggestion for service {service_id}: {e}"
        )
        return None


def fetch_service_attributes(service_id: int) -> List[Dict[str, Any]]:
    """
    Fetch attributes for a specific service.

    Args:
        service_id: The ID of the service.

    Returns:
        A list of attribute dictionaries.
    """
    attributes = []
    try:
        with get_db_connection() as conn:
            with conn.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT a.id, a.slug, a.title, a.description, a.category, a.type
                    FROM "Attribute" a
                    JOIN "ServiceAttribute" sa ON a.id = sa."attributeId"
                    WHERE sa."serviceId" = %s
                """,
                    (service_id,),
                )
                attributes = cursor.fetchall()
    except Exception as e:
        logger.error(f"Error fetching attributes for service {service_id}: {e}")

    return attributes


def get_attribute_id_by_slug(slug: str) -> Optional[int]:
    attribute_id = None
    try:
        with get_db_connection() as conn:
            with conn.cursor(row_factory=dict_row) as cursor:
                cursor.execute('SELECT id FROM "Attribute" WHERE slug = %s', (slug,))
                row = cursor.fetchone()
                if row:
                    attribute_id = row["id"]
    except Exception as e:
        logger.error(f"Error fetching attribute id for slug '{slug}': {e}")
    return attribute_id


def add_service_attribute(service_id: int, attribute_id: int) -> bool:
    try:
        with get_db_connection() as conn:
            with conn.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    'SELECT 1 FROM "ServiceAttribute" WHERE "serviceId" = %s AND "attributeId" = %s',
                    (service_id, attribute_id),
                )
                if cursor.fetchone():
                    return True
                cursor.execute(
                    'INSERT INTO "ServiceAttribute" ("serviceId", "attributeId", "createdAt") VALUES (%s, %s, NOW())',
                    (service_id, attribute_id),
                )
                conn.commit()
                logger.info(
                    f"Added attribute id {attribute_id} to service {service_id}"
                )
                return True
    except Exception as e:
        logger.error(
            f"Error adding attribute id {attribute_id} to service {service_id}: {e}"
        )
        return False


def remove_service_attribute(service_id: int, attribute_id: int) -> bool:
    try:
        with get_db_connection() as conn:
            with conn.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    'DELETE FROM "ServiceAttribute" WHERE "serviceId" = %s AND "attributeId" = %s',
                    (service_id, attribute_id),
                )
                conn.commit()
                logger.info(
                    f"Removed attribute id {attribute_id} from service {service_id}"
                )
                return True
    except Exception as e:
        logger.error(
            f"Error removing attribute id {attribute_id} from service {service_id}: {e}"
        )
        return False


def add_service_attribute_by_slug(service_id: int, attribute_slug: str) -> bool:
    attribute_id = get_attribute_id_by_slug(attribute_slug)
    if attribute_id is None:
        logger.error(f"Attribute with slug '{attribute_slug}' not found.")
        return False
    return add_service_attribute(service_id, attribute_id)


def remove_service_attribute_by_slug(service_id: int, attribute_slug: str) -> bool:
    attribute_id = get_attribute_id_by_slug(attribute_slug)
    if attribute_id is None:
        logger.error(f"Attribute with slug '{attribute_slug}' not found.")
        return False
    return remove_service_attribute(service_id, attribute_id)


class LegalDocumentRow(TypedDict):
    """Stored state of one legal page, as needed to diff the next crawl."""

    id: int
    urlKey: str
    normalizedText: str


def get_legal_documents(service_id: int) -> Dict[str, LegalDocumentRow]:
    """Return the stored legal documents for a service, keyed by urlKey."""
    try:
        with get_db_connection() as conn:
            with conn.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    'SELECT id, "urlKey", url, "normalizedText", "removedAt" '
                    'FROM "ServiceLegalDocument" WHERE "serviceId" = %s',
                    (service_id,),
                )
                return {row["urlKey"]: row for row in cursor.fetchall()}
    except Exception as e:
        logger.error(f"Error loading legal documents for service {service_id}: {e}")
        return {}


def upsert_legal_document(
    service_id: int,
    url_key: str,
    url: str,
    kind: str,
    content_hash: str,
    normalized_text: str,
    changed: bool,
) -> Optional[int]:
    """Store the latest crawl of one legal page.

    ``checkedAt`` moves on every crawl; ``changedAt`` only when the normalized
    text actually moved.
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    INSERT INTO "ServiceLegalDocument"
                        ("serviceId", "urlKey", url, kind, "contentHash", "normalizedText", "checkedAt", "changedAt")
                    VALUES (%s, %s, %s, %s::"LegalDocumentKind", %s, %s, NOW(), CASE WHEN %s THEN NOW() END)
                    ON CONFLICT ("serviceId", "urlKey") DO UPDATE SET
                        url = EXCLUDED.url,
                        kind = EXCLUDED.kind,
                        "contentHash" = EXCLUDED."contentHash",
                        "normalizedText" = EXCLUDED."normalizedText",
                        "checkedAt" = NOW(),
                        "removedAt" = NULL,
                        "unreachableAt" = NULL,
                        "changedAt" = CASE
                            WHEN %s THEN NOW()
                            ELSE "ServiceLegalDocument"."changedAt"
                        END
                    RETURNING id
                    """,
                    (
                        service_id,
                        url_key,
                        url,
                        kind,
                        content_hash,
                        normalized_text,
                        changed,
                        changed,
                    ),
                )
                row = cursor.fetchone()
                conn.commit()
                return int(row["id"]) if row else None
    except Exception as e:
        logger.error(
            f"Error saving legal document {url_key} for service {service_id}: {e}"
        )
        return None


def mark_legal_document_removed(document_id: int) -> None:
    """Stamp a document as gone so the removal is recorded once, not every crawl."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    'UPDATE "ServiceLegalDocument" SET "removedAt" = NOW() WHERE id = %s',
                    (document_id,),
                )
                conn.commit()
    except Exception as e:
        logger.error(f"Error marking legal document {document_id} removed: {e}")


def clear_legal_document_removal(document_id: int) -> None:
    """Clear the removal stamp of a page that answers again.

    Done here rather than left to the upsert, which does not run for a page the
    crawler reached but could not use, and would then let the restoration be
    recorded again on every later crawl.
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    'UPDATE "ServiceLegalDocument" SET "removedAt" = NULL WHERE id = %s',
                    (document_id,),
                )
                conn.commit()
    except Exception as e:
        logger.error(f"Error clearing removal of legal document {document_id}: {e}")


def mark_legal_document_unreachable(document_id: int) -> None:
    """Stamp a document the crawler could not read, leaving its stored text alone."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    'UPDATE "ServiceLegalDocument" SET "unreachableAt" = NOW() '
                    'WHERE id = %s AND "unreachableAt" IS NULL',
                    (document_id,),
                )
                conn.commit()
    except Exception as e:
        logger.error(f"Error marking legal document {document_id} unreachable: {e}")


def create_legal_revision(
    service_id: int,
    document_id: int,
    change_level: str,
    changed_words: int,
    summary: Optional[str],
    diff: Optional[str],
) -> Optional[int]:
    """Append one recorded change, and stamp the service as having changed.

    The service-level timestamp is written here so a revision and the stamp
    that advertises it cannot disagree.
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    INSERT INTO "ServiceLegalRevision"
                        ("serviceId", "documentId", "changeLevel", "changedWords", summary, diff)
                    VALUES (%s, %s, %s::"LegalChangeLevel", %s, %s, %s)
                    RETURNING id
                    """,
                    (
                        service_id,
                        document_id,
                        change_level,
                        changed_words,
                        summary,
                        diff,
                    ),
                )
                row = cursor.fetchone()
                cursor.execute(
                    'UPDATE "Service" SET "tosChangedAt" = NOW() WHERE id = %s',
                    (service_id,),
                )
                conn.commit()
                return int(row["id"]) if row else None
    except Exception as e:
        logger.error(f"Error saving legal revision for service {service_id}: {e}")
        return None


def get_pending_comments(service_id: int) -> List[Dict[str, Any]]:
    """
    Return the IDs of comments awaiting AI review for a service, oldest first.

    Selects only rows the AI has never decided (aiDecidedAt IS NULL) and that no
    human has touched (humanAction IS NULL): review-once. This stops the worker
    from re-deciding held comments every run and, critically, from overwriting a
    moderator's HOLD by re-approving on a later pass. The predicate is exactly
    the AWAITING_AI moderationState; it stays as raw columns so the worker does
    not depend on the trigger-maintained column existing.
    """
    comments = []
    try:
        with get_db_connection() as conn:
            with conn.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT c.id, c.version
                    FROM "Comment" c
                    WHERE c."serviceId" = %s
                      AND c.status = 'PENDING'
                      AND c."aiDecidedAt" IS NULL
                      AND c."humanAction" IS NULL
                    ORDER BY c."createdAt" ASC
                    """,
                    (service_id,),
                )
                comments = cursor.fetchall()
    except Exception as e:
        logger.error(f"Error fetching pending comments for service {service_id}: {e}")
    return comments


def get_pending_revisions(service_id: int) -> List[Dict[str, Any]]:
    """Edits on a service's posts that the AI has not looked at yet, oldest first.

    Each row carries what the edit gate needs: whether it changes the experience's
    sentiment or outcome, and whether that experience has checked proof.
    """
    revisions: List[Dict[str, Any]] = []
    try:
        with get_db_connection() as conn:
            with conn.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT r.id, r."commentId", r.content, r.kind, c.content AS "publishedContent",
                      r."experienceData"->'issues' AS "editedIssues", c.issues::text[] AS "publishedIssues",
                      r.kind <> c.kind AS "changesKind",
                      c."humanAction" = 'HOLD' AS "heldByModerator",
                      EXISTS (
                        SELECT 1 FROM "ContactThread" t
                        WHERE t."commentId" = c.id AND t.category = 'COMMENT_REPORT' AND t.status <> 'RESOLVED'
                      ) AS "hasOpenReport",
                      e.id IS NOT NULL AND (
                        (r."experienceData"->>'sentiment') IS DISTINCT FROM e.sentiment::text
                        OR COALESCE(r."experienceData"->>'outcome', 'UNSPECIFIED') <> e.outcome::text
                        OR ARRAY(
                          SELECT jsonb_array_elements_text(COALESCE(r."experienceData"->'issues', '[]'::jsonb)) ORDER BY 1
                        ) IS DISTINCT FROM ARRAY(SELECT unnest(c.issues)::text ORDER BY 1)
                      ) AS "changesVerdict",
                      comment_has_accepted_proof(c.id) AS "experienceHasCheckedProof"
                    FROM "CommentRevision" r
                    JOIN "Comment" c ON c.id = r."commentId"
                    LEFT JOIN "CommentExperience" e ON e."commentId" = c.id
                    WHERE c."serviceId" = %s AND r.status = 'PENDING'
                      AND r."aiDecidedAt" IS NULL AND r."redactedAt" IS NULL
                    ORDER BY r."createdAt" ASC
                    """,
                    (service_id,),
                )
                revisions = cursor.fetchall()
    except Exception as e:
        logger.error(f"Error fetching pending edits for service {service_id}: {e}")
    return revisions


def apply_ai_edit_decision(
    revision_id: int,
    ai_action: TypeLiteral["APPROVE", "REJECT", "HOLD"],
    ai_reasoning: str,
    rejection_rule: Optional[str],
) -> TypeLiteral["APPROVE", "REJECT", "HOLD"]:
    """Record the AI's verdict on an edit and carry it out through apply_comment_revision.

    Returns the action that stuck: an approval that finds the post changed since the
    edit was written is recorded as HOLD, so the edit waits for a moderator.
    """
    with get_db_connection() as conn:
        with conn.transaction():
            with conn.cursor() as cursor:
                outcome = ai_action
                if ai_action != "HOLD":
                    try:
                        # A savepoint, so a malformed edit rolls back alone and is held instead
                        # of failing the same way on every run.
                        with conn.transaction():
                            cursor.execute(
                                'SELECT apply_comment_revision(%s, %s, NULL, NULL, %s::"CommentRule")',
                                (revision_id, ai_action == "APPROVE", rejection_rule),
                            )
                            row = cursor.fetchone()
                    except psycopg.Error as e:
                        logger.error(
                            f"Could not apply edit {revision_id}: {e}; holding it"
                        )
                        row = None
                    if not row or not row[0]:
                        outcome = "HOLD"
                cursor.execute(
                    """
                    UPDATE "CommentRevision"
                    SET "aiAction" = %s::"ModerationAction", "aiDecidedAt" = NOW(), "aiReasoning" = %s
                    WHERE id = %s AND (status = 'PENDING' OR "decidedById" IS NULL)
                    """,
                    (outcome, ai_reasoning, revision_id),
                )
                return outcome


def get_moderation_context(
    comment_id: int, content: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Fetch the structured moderation context for a comment.

    Delegates to the SQL function get_comment_moderation_context, which returns a
    single JSONB document with the comment, the service, and a context block
    containing cluster signals, recent events, calibration samples, and recent
    affiliated-team activity. Returns None if the comment does not exist.
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT get_comment_moderation_context(%s, %s)::text",
                    (comment_id, content),
                )
                row = cursor.fetchone()
                if not row or row[0] is None:
                    return None
                return json.loads(row[0])
    except Exception as e:
        logger.error(f"Error fetching moderation context for comment {comment_id}: {e}")
        return None


def apply_ai_moderation_decision(
    comment_id: int,
    status: str,
    ai_action: str,
    ai_quality: int,
    ai_is_spam: bool,
    ai_is_brigade: bool,
    ai_brigade_confidence: int,
    ai_signals: Optional[Dict[str, Any]],
    ai_reasoning: str,
    rejection_rule: Optional[str],
    expected_version: int,
    sentiment: Optional[str] = None,
    kind: Optional[str] = None,
) -> bool:
    if sentiment not in (None, "POSITIVE", "NEUTRAL", "NEGATIVE"):
        return False
    if kind not in (None, "EXPERIENCE", "DISCUSSION", "UNCLASSIFIED"):
        return False
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE "Comment" SET status=%s::"CommentStatus", "aiDecidedAt"=NOW(),
                      "aiAction"=%s::"ModerationAction", "aiQuality"=%s, "aiIsSpam"=%s,
                      "aiIsBrigade"=%s, "aiBrigadeConfidence"=%s, "aiSignals"=%s::jsonb,
                      "aiReasoning"=%s, "aiDecisionReason"=%s::"CommentRule", "updatedAt"=NOW(),
                      kind=CASE WHEN kind='UNCLASSIFIED' AND "parentId" IS NULL
                        THEN COALESCE(%s::"CommentKind", kind) ELSE kind END
                    WHERE id=%s AND version=%s AND status='PENDING'
                      AND "humanAction" IS NULL AND "aiDecidedAt" IS NULL
                    RETURNING kind, "parentId"
                    """,
                    (
                        status,
                        ai_action,
                        ai_quality,
                        ai_is_spam,
                        ai_is_brigade,
                        ai_brigade_confidence,
                        json.dumps(ai_signals),
                        ai_reasoning,
                        rejection_rule,
                        kind,
                        comment_id,
                        expected_version,
                    ),
                )
                row = cursor.fetchone()
                if row is None:
                    conn.rollback()
                    return False
                if row[0] == "EXPERIENCE" and row[1] is None:
                    cursor.execute(
                        """INSERT INTO "CommentExperience" ("commentId", sentiment, "sentimentSource", "classifiedAt")
                        VALUES (%s, %s::"ExperienceSentiment", CASE WHEN %s::text IS NULL THEN NULL ELSE 'AI'::"SentimentSource" END, NOW())
                        ON CONFLICT ("commentId") DO UPDATE SET sentiment=EXCLUDED.sentiment,
                          "sentimentSource"=EXCLUDED."sentimentSource", "classifiedAt"=NOW()
                        WHERE "CommentExperience".sentiment IS NULL AND "CommentExperience"."sentimentSource" IS NULL""",
                        (comment_id, sentiment, sentiment),
                    )
                conn.commit()
                return True
    except Exception as error:
        logger.error(
            f"Error applying moderation for comment {comment_id}: {type(error).__name__}"
        )
        return False


def touch_service_updated_at(service_id: int) -> bool:
    """
    Update the updatedAt field for a specific service to now.

    Args:
        service_id: The ID of the service.

    Returns:
        bool: True if the update was successful, False otherwise.
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    UPDATE "Service"
                    SET "updatedAt" = NOW()
                    WHERE id = %s
                    """,
                    (service_id,),
                )
                conn.commit()
                logger.info(f"Successfully touched updatedAt for service {service_id}")
                return True
    except Exception as e:
        logger.error(f"Error touching updatedAt for service {service_id}: {e}")
        return False


def run_db_query(query: Any, params: Optional[Any] = None) -> List[Dict[str, Any]]:
    results = []
    try:
        with get_db_connection() as conn:
            with conn.cursor(row_factory=dict_row) as cursor:
                if params is None:
                    cursor.execute(query)
                else:
                    cursor.execute(query, params)
                results = cursor.fetchall()
    except Exception as e:
        logger.error(f"Error running query: {e}")
    return results


def delete_user_account(user_id: int) -> None:
    with get_db_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT delete_user_account(%s::int)", (user_id,))
        conn.commit()


def execute_db_command(command: str, params: Optional[Any] = None) -> int:
    """
    Execute a database command (INSERT, UPDATE, DELETE) and return affected rows.

    Args:
        command: The SQL command string.
        params: Optional parameters for the command.

    Returns:
        The number of rows affected by the command.
    """
    affected_rows = 0
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                # Cast the string to the expected type to satisfy the type checker
                # In runtime, this is equivalent to passing the command directly
                cursor.execute(command, params)  # type: ignore
                affected_rows = cursor.rowcount
                conn.commit()
                logger.info(f"Executed command, {affected_rows} rows affected.")
    except Exception as e:
        logger.error(f"Error executing command: {e}")
    return affected_rows


def create_attribute(
    slug: str,
    title: str,
    description: str,
    category: str,
    type: str,
    privacy_points: float = 0,
    trust_points: float = 0,
    overall_points: float = 0,
) -> Optional[int]:
    """
    Create a new attribute in the database if it doesn't already exist.

    Args:
        slug: The unique slug for the attribute.
        title: The display title of the attribute.
        description: The description of the attribute.
        category: The category of the attribute (e.g., 'TRUST', 'PRIVACY').
        type: The type of the attribute (e.g., 'WARNING', 'FEATURE').
        privacy_points: Points affecting privacy score (default: 0).
        trust_points: Points affecting trust score (default: 0).
        overall_points: Points affecting overall score (default: 0).

    Returns:
        The ID of the created (or existing) attribute, or None if creation failed.
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor(row_factory=dict_row) as cursor:
                # First check if the attribute already exists
                cursor.execute('SELECT id FROM "Attribute" WHERE slug = %s', (slug,))
                row = cursor.fetchone()
                if row:
                    logger.info(
                        f"Attribute with slug '{slug}' already exists, id: {row['id']}"
                    )
                    return row["id"]

                # Create the attribute if it doesn't exist
                cursor.execute(
                    """
                    INSERT INTO "Attribute" (
                        slug, title, description, "privacyPoints", "trustPoints", 
                        category, type, "createdAt", "updatedAt"
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, NOW(), NOW()
                    ) RETURNING id
                    """,
                    (
                        slug,
                        title,
                        description,
                        privacy_points,
                        trust_points,
                        category,
                        type,
                    ),
                )
                conn.commit()
                result = cursor.fetchone()
                if result is None:
                    logger.error(
                        f"Failed to retrieve ID for newly created attribute with slug '{slug}'"
                    )
                    return None
                attribute_id = result["id"]
                logger.info(
                    f"Created new attribute with slug '{slug}', id: {attribute_id}"
                )
                return attribute_id
    except Exception as e:
        logger.error(f"Error creating attribute with slug '{slug}': {e}")
        return None
