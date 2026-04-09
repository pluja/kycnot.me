"""
Database operations for the pyworker package.
"""

import hashlib
import json
import secrets
from contextlib import contextmanager
from datetime import datetime
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


# Moved from tasks/comment_moderation.py
class CommentType(TypedDict):
    id: int
    upvotes: int
    status: str  # Assuming CommentStatus Enum isn't used across modules yet
    suspicious: bool
    requiresAdminReview: bool
    communityNote: Optional[str]
    internalNote: Optional[str]
    privateContext: Optional[str]
    content: str
    rating: Optional[float]
    createdAt: datetime
    updatedAt: datetime
    authorId: int
    serviceId: int
    parentId: Optional[int]
    # Add author/service/reply fields if needed by update_comment


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


class TosReviewType(TypedDict, total=False):
    contentHash: str
    kycLevel: int
    summary: str
    complexity: TypeLiteral["low", "medium", "high"]
    highlights: List[Dict[str, Any]]


class CommentSentimentSummaryType(TypedDict):
    summary: str
    sentiment: TypeLiteral["positive", "negative", "neutral"]
    whatUsersLike: List[str]
    whatUsersDislike: List[str]


class CommentModerationType(TypedDict):
    isSpam: bool
    requiresAdminReview: bool
    contextNote: str
    internalNote: str
    commentQuality: int


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


def ensure_bot_user() -> int:
    """
    Get or create the bot user that PyWorker uses to author edit suggestions.

    The user is looked up by name (from config.BOT_USERNAME). If it doesn't
    exist, a new row is inserted with a random secret token hash (the token
    itself is discarded — bot accounts don't log in through the web UI).

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

                # Create a new bot user with a random, unusable secret token
                random_token = secrets.token_hex(32)
                token_hash = hashlib.sha512(random_token.encode()).hexdigest()

                cursor.execute(
                    """
                    INSERT INTO "User" (name, "secretTokenHash", "createdAt", "updatedAt", "lastLoginAt")
                    VALUES (%s, %s, NOW(), NOW(), NOW())
                    RETURNING id
                    """,
                    (username, token_hash),
                )
                conn.commit()
                row = cursor.fetchone()
                assert row is not None, "INSERT RETURNING should always return a row"
                _bot_user_id = int(row["id"])
                logger.info(f"Created bot user '{username}' (ID: {_bot_user_id})")
                return _bot_user_id
    except Exception as e:
        logger.error(f"Error ensuring bot user '{username}': {e}")
        raise


# --- Edit Suggestions ---


def create_kyc_edit_suggestion(
    service_id: int,
    old_level: Optional[int],
    new_level: int,
    review_summary: Optional[str] = None,
) -> Optional[int]:
    """
    Create a ServiceSuggestion proposing a KYC level change, authored by the bot user.

    Returns:
        The suggestion ID, or None on failure.
    """
    bot_user_id = ensure_bot_user()

    lines = [
        "⚠️ AI-Generated Suggestion — Requires human review",
        "",
        f"Proposed KYC level change: {old_level} → {new_level}",
    ]

    if review_summary:
        lines += [
            "",
            "AI reasoning (from TOS review):",
            review_summary,
        ]

    notes = "\n".join(lines)

    try:
        with get_db_connection() as conn:
            with conn.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    INSERT INTO "ServiceSuggestion" (type, status, notes, "userId", "serviceId", "createdAt", "updatedAt")
                    VALUES ('EDIT_SERVICE', 'PENDING', %s, %s, %s, NOW(), NOW())
                    RETURNING id
                    """,
                    (notes, bot_user_id, service_id),
                )
                conn.commit()
                row = cursor.fetchone()
                suggestion_id = row["id"] if row else None
                if suggestion_id:
                    logger.info(
                        f"Created KYC edit suggestion #{suggestion_id} for service {service_id} "
                        f"(level {old_level} → {new_level})"
                    )
                return suggestion_id
    except Exception as e:
        logger.error(
            f"Error creating KYC edit suggestion for service {service_id}: {e}"
        )
        return None


# --- Database Functions ---


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
                        "tosReview", "tosReviewAt", "userSentiment", "userSentimentAt"
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
    Fetch all public and verified services that have at least one pending comment.

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
                        s."tosReview", s."tosReviewAt", s."userSentiment", s."userSentimentAt"
                    FROM "Service" s
                    JOIN "Comment" c ON s.id = c."serviceId"
                    WHERE c.status = 'PENDING'
                        AND s."serviceVisibility" = 'PUBLIC'
                        AND (s."verificationStatus" = 'VERIFICATION_SUCCESS'
                        OR s."verificationStatus" = 'COMMUNITY_CONTRIBUTED'
                        OR s."verificationStatus" = 'APPROVED')
                    ORDER BY s.id
                """)
                services = cursor.fetchall()
                logger.info(
                    f"Fetched {len(services)} services with pending comments from the database"
                )
    except Exception as e:
        logger.error(f"Error fetching services with pending comments: {e}")

    return services


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


def save_tos_review(service_id: int, review: Optional[TosReviewType]):
    """Persist a TOS review and/or update the timestamp for a service.

    If *review* is ``None`` the existing review (if any) is preserved while
    only the ``tosReviewAt`` column is updated. This ensures we still track
    when the review task last ran even if the review generation failed or
    produced no changes.
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor(row_factory=dict_row) as cursor:
                if review is None:
                    cursor.execute(
                        'UPDATE "Service" SET "tosReviewAt" = NOW() WHERE id = %s AND "tosReview" IS NULL',
                        (service_id,),
                    )
                else:
                    review_json = json.dumps(review)
                    cursor.execute(
                        'UPDATE "Service" SET "tosReview" = %s, "tosReviewAt" = NOW() WHERE id = %s',
                        (review_json, service_id),
                    )

                conn.commit()
                logger.info(
                    f"Successfully saved TOS review (updated={review is not None}) for service {service_id}"
                )
    except Exception as e:
        logger.error(f"Error saving TOS review for service {service_id}: {e}")


def get_comments(service_id: int, status: str = "APPROVED") -> List[Dict[str, Any]]:
    """
    Get all comments for a specific service with the specified status.

    Args:
        service_id: The ID of the service.
        status: The status of comments to fetch (e.g. 'APPROVED', 'PENDING'). Defaults to 'APPROVED'.

    Returns:
        A list of comment dictionaries.
        NOTE: The structure returned by the SQL query might be different from CommentType.
            Adjust CommentType or parsing if needed elsewhere.
    """
    comments = []
    try:
        with get_db_connection() as conn:
            with conn.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    WITH RECURSIVE comment_tree AS (
                        -- Base case: get all root comments (no parent)
                        SELECT 
                            c.id, 
                            c.content, 
                            c.rating,
                            c.upvotes,
                            c."createdAt",
                            c."updatedAt",
                            c."parentId",
                            c.status,
                            u.id as "authorId",
                            u.name as "authorName",
                            u."displayName" as "authorDisplayName",
                            u.picture as "authorPicture",
                            u.verified as "authorVerified",
                            0 as depth
                        FROM "Comment" c
                        JOIN "User" u ON c."authorId" = u.id
                        WHERE c."serviceId" = %s
                        AND c.status = %s
                        AND c."parentId" IS NULL
                        
                        UNION ALL
                        
                        -- Recursive case: get all replies
                        SELECT 
                            c.id, 
                            c.content, 
                            c.rating,
                            c.upvotes,
                            c."createdAt",
                            c."updatedAt",
                            c."parentId",
                            c.status,
                            u.id as "authorId",
                            u.name as "authorName",
                            u."displayName" as "authorDisplayName",
                            u.picture as "authorPicture",
                            u.verified as "authorVerified",
                            ct.depth + 1
                        FROM "Comment" c
                        JOIN "User" u ON c."authorId" = u.id
                        JOIN comment_tree ct ON c."parentId" = ct.id
                        WHERE c.status = %s
                    )
                    SELECT * FROM comment_tree
                    ORDER BY "createdAt" DESC, depth ASC
                """,
                    (service_id, status, status),
                )
                comments = cursor.fetchall()
    except Exception as e:
        logger.error(
            f"Error fetching comments for service {service_id} with status {status}: {e}"
        )

    return comments


def get_pending_comments(service_id: int) -> List[Dict[str, Any]]:
    """
    Get all PENDING comments for a specific service using a flat SELECT.
    Unlike get_comments(), this does NOT use a recursive CTE, so PENDING replies
    whose parent is APPROVED are correctly included.
    """
    comments = []
    try:
        with get_db_connection() as conn:
            with conn.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT
                        c.id, c.content, c.rating, c.upvotes, c."createdAt", c."parentId",
                        c."orderId", c."privateContext", c.status,
                        u.id AS "authorId", u.name AS "authorName",
                        u."displayName" AS "authorDisplayName", u.verified AS "authorVerified"
                    FROM "Comment" c
                    JOIN "User" u ON c."authorId" = u.id
                    WHERE c."serviceId" = %s AND c.status = 'PENDING'
                    ORDER BY c."createdAt" ASC
                    """,
                    (service_id,),
                )
                comments = cursor.fetchall()
    except Exception as e:
        logger.error(f"Error fetching pending comments for service {service_id}: {e}")
    return comments


def get_comment_by_id(comment_id: int) -> Optional[Dict[str, Any]]:
    """Fetch a single comment by ID."""
    try:
        with get_db_connection() as conn:
            with conn.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT c.id, c.content, c.status,
                           u.name AS "authorName", u."displayName" AS "authorDisplayName"
                    FROM "Comment" c
                    JOIN "User" u ON c."authorId" = u.id
                    WHERE c.id = %s
                    """,
                    (comment_id,),
                )
                return cursor.fetchone()
    except Exception as e:
        logger.error(f"Error fetching comment {comment_id}: {e}")
    return None


def get_recent_approved_comments(
    service_id: int, limit: int = 10
) -> List[Dict[str, Any]]:
    """Fetch recent APPROVED/VERIFIED comments for a service (for AI context)."""
    comments = []
    try:
        with get_db_connection() as conn:
            with conn.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT c.id, c.content, c.rating, c.upvotes, c."createdAt", c."parentId",
                           u."displayName" AS "authorDisplayName"
                    FROM "Comment" c
                    JOIN "User" u ON c."authorId" = u.id
                    WHERE c."serviceId" = %s AND c.status IN ('APPROVED', 'VERIFIED')
                    ORDER BY c."createdAt" DESC
                    LIMIT %s
                    """,
                    (service_id, limit),
                )
                comments = cursor.fetchall()
    except Exception as e:
        logger.error(
            f"Error fetching recent approved comments for service {service_id}: {e}"
        )
    return comments


def get_recent_approved_order_ids(service_id: int, limit: int = 5) -> List[str]:
    """Fetch recent non-null orderIds from APPROVED/VERIFIED comments for a service."""
    order_ids = []
    try:
        with get_db_connection() as conn:
            with conn.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT c."orderId"
                    FROM "Comment" c
                    WHERE c."serviceId" = %s
                      AND c."orderId" IS NOT NULL
                      AND c.status IN ('APPROVED', 'VERIFIED')
                    ORDER BY COALESCE(c."approvedAt", c."updatedAt") DESC
                    LIMIT %s
                    """,
                    (service_id, limit),
                )
                rows = cursor.fetchall()
                order_ids = [row["orderId"] for row in rows]
    except Exception as e:
        logger.error(
            f"Error fetching recent approved order IDs for service {service_id}: {e}"
        )
    return order_ids


def get_max_comment_updated_at(
    service_id: int, status: str = "APPROVED"
) -> Optional[datetime]:
    """
    Get the maximum 'updatedAt' timestamp for comments of a specific service and status.

    Args:
        service_id: The ID of the service.
        status: The status of comments to consider.

    Returns:
        The maximum 'updatedAt' timestamp as a datetime object, or None if no matching comments.
    """
    max_updated_at = None
    try:
        with get_db_connection() as conn:
            with (
                conn.cursor() as cursor
            ):  # dict_row not strictly needed for single value
                cursor.execute(
                    """
                    SELECT MAX("updatedAt") 
                    FROM "Comment"
                    WHERE "serviceId" = %s AND status = %s
                    """,
                    (service_id, status),
                )
                result = cursor.fetchone()
                if result and result[0] is not None:
                    max_updated_at = result[0]
    except Exception as e:
        logger.error(
            f"Error fetching max comment updatedAt for service {service_id} with status {status}: {e}"
        )
    return max_updated_at


def save_user_sentiment(
    service_id: int,
    sentiment: Optional[CommentSentimentSummaryType],
    last_processed_comment_timestamp: Optional[datetime],
):
    """
    Save user sentiment for a specific service and the timestamp of the last comment processed.

    Args:
        service_id: The ID of the service.
        sentiment: A dictionary containing the sentiment data, or None to clear it.
        last_processed_comment_timestamp: The 'updatedAt' timestamp of the most recent comment
                                          considered in this sentiment analysis. Can be None.
    """
    try:
        sentiment_json = json.dumps(sentiment) if sentiment is not None else None
        with get_db_connection() as conn:
            with conn.cursor() as cursor:  # row_factory not needed for UPDATE
                cursor.execute(
                    """
                    UPDATE "Service" 
                    SET "userSentiment" = %s, "userSentimentAt" = %s
                    WHERE id = %s
                    """,
                    (sentiment_json, last_processed_comment_timestamp, service_id),
                )
                conn.commit()
                if sentiment:
                    logger.info(
                        f"Successfully saved user sentiment for service {service_id} with last comment processed at {last_processed_comment_timestamp}"
                    )
                else:
                    logger.info(
                        f"Successfully cleared user sentiment for service {service_id}, last comment processed at set to {last_processed_comment_timestamp}"
                    )
    except Exception as e:
        logger.error(f"Error saving user sentiment for service {service_id}: {e}")


def update_comment_moderation(comment_data: CommentType):
    """Write AI triage assessment to a comment without changing its status.

    The AI worker populates requiresAdminReview, communityNote, and
    internalNote so human moderators can make informed approve/reject
    decisions.  Status is intentionally NOT written here — only humans
    change comment status.
    """
    comment_id = comment_data.get("id")
    if not comment_id:
        logger.error("Cannot update comment: 'id' is missing from comment_data.")
        return

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE "Comment"
                    SET 
                        "requiresAdminReview" = %(requiresAdminReview)s,
                        "communityNote" = %(communityNote)s,
                        "internalNote" = %(internalNote)s,
                        "updatedAt" = NOW()
                    WHERE id = %(id)s
                """,
                    comment_data,
                )
                conn.commit()
                logger.info(f"Successfully updated comment {comment_id}")
    except Exception as e:
        logger.error(f"Error updating comment {comment_id}: {e}")


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
