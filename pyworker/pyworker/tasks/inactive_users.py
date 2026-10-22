"""
Task for handling inactive users - sending deletion warnings and cleaning up accounts.
"""

from datetime import timedelta, date
from typing import Any, Dict

from pyworker.database import delete_user_account, execute_db_command, run_db_query
from pyworker.tasks.base import Task


# _HAS_NO_STANDING holds for accounts with no staff role and nothing tying them to the site beyond posts:
# no service affiliation, API key, contact thread or case.
_HAS_NO_STANDING = """
    u."admin" = false
    AND cardinality(u.capabilities) = 0
    AND u."verified" = false
    AND u."totalKarma" = 0
    AND NOT EXISTS (SELECT 1 FROM "ServiceUser" su WHERE su."userId" = u."id")
    AND NOT EXISTS (SELECT 1 FROM "ApiKey" ak WHERE ak."userId" = u."id")
    AND NOT EXISTS (SELECT 1 FROM "ContactThread" ct WHERE ct."authorId" = u."id")
    AND NOT EXISTS (
        SELECT 1 FROM "Case" ca WHERE ca."reportedById" = u."id" OR ca."createdById" = u."id"
    )
    AND NOT EXISTS (SELECT 1 FROM "CaseUpdate" cu WHERE cu."authorId" = u."id")
    AND NOT EXISTS (SELECT 1 FROM "_CaseParticipants" cp WHERE cp."B" = u."id")
"""

_INACTIVITY_DAYS = 365
_NOTICE_DAYS = 30

# _STILL_INACTIVE holds for a scheduled account that had not logged in for a year when it was scheduled,
# and has not logged in, posted or suggested anything since.
_STILL_INACTIVE = f"""
    {_HAS_NO_STANDING}
    AND u."lastLoginAt" < (u."scheduledDeletionAt" - INTERVAL '{_INACTIVITY_DAYS + _NOTICE_DAYS} days')
    AND NOT EXISTS (
        SELECT 1 FROM "Comment" c
        WHERE c."authorId" = u."id"
            AND c."createdAt" > (u."scheduledDeletionAt" - INTERVAL '{_NOTICE_DAYS} days')
    )
    AND NOT EXISTS (
        SELECT 1 FROM "ServiceSuggestion" ss
        WHERE ss."userId" = u."id"
            AND ss."createdAt" > (u."scheduledDeletionAt" - INTERVAL '{_NOTICE_DAYS} days')
    )
"""


class InactiveUsersTask(Task):
    """Task for handling inactive users"""

    def __init__(self):
        """Initialize the inactive users task."""
        super().__init__("inactive_users")

    def run(self) -> Dict[str, Any]:
        """
        Run the inactive users task.

        This task:
        1. Identifies users who have been inactive for 1 year
        2. Schedules them for deletion
        3. Sends warning notifications at 30, 15, 5, and 1 day intervals
        4. Deletes accounts that have reached their deletion date
        """
        results = {
            "users_scheduled_for_deletion": 0,
            "notifications_sent": 0,
            "accounts_deleted": 0,
            "deletions_cancelled": 0,
        }

        # Step 1: Cancel deletion for users who became active again
        results["deletions_cancelled"] = self._cancel_deletion_for_active_users()

        # Step 2: Schedule new inactive users for deletion
        results["users_scheduled_for_deletion"] = (
            self._schedule_inactive_users_for_deletion()
        )

        # Step 3: Send warning notifications
        results["notifications_sent"] = self._send_deletion_warnings()

        # Step 4: Delete accounts that have reached their deletion date
        results["accounts_deleted"] = self._delete_scheduled_accounts()

        self.logger.info(
            f"Inactive users task completed. "
            f"Deletions cancelled: {results['deletions_cancelled']}, "
            f"Scheduled: {results['users_scheduled_for_deletion']}, "
            f"Notifications sent: {results['notifications_sent']}, "
            f"Accounts deleted: {results['accounts_deleted']}"
        )

        return results

    def _schedule_inactive_users_for_deletion(self) -> int:
        """
        Schedule inactive users for deletion.

        A user is inactive when the account is over a year old, has not logged in for a year, never
        posted or suggested anything, and has no standing (see _HAS_NO_STANDING).
        """
        one_year_ago = date.today() - timedelta(days=_INACTIVITY_DAYS)
        deletion_date = date.today() + timedelta(days=_NOTICE_DAYS)

        # Find inactive users
        query = f"""
        UPDATE "User"
        SET "scheduledDeletionAt" = %s, "updatedAt" = NOW()
        WHERE "id" IN (
            SELECT u."id"
            FROM "User" u
            WHERE u."createdAt" < %s
                AND u."lastLoginAt" < %s
                AND u."scheduledDeletionAt" IS NULL
                AND {_HAS_NO_STANDING}
                AND NOT EXISTS (SELECT 1 FROM "Comment" c WHERE c."authorId" = u."id")
                AND NOT EXISTS (SELECT 1 FROM "ServiceSuggestion" ss WHERE ss."userId" = u."id")
        )
        """

        count = execute_db_command(query, (deletion_date, one_year_ago, one_year_ago))
        self.logger.info(
            f"Scheduled {count} inactive users for deletion on {deletion_date}"
        )
        return count

    def _send_deletion_warnings(self) -> int:
        """
        Send deletion warning notifications to users at appropriate intervals.
        """
        today = date.today()
        notifications_sent = 0

        # Define warning intervals and their corresponding notification types
        warning_intervals = [
            (30, "ACCOUNT_DELETION_WARNING_30_DAYS"),
            (15, "ACCOUNT_DELETION_WARNING_15_DAYS"),
            (5, "ACCOUNT_DELETION_WARNING_5_DAYS"),
            (1, "ACCOUNT_DELETION_WARNING_1_DAY"),
        ]

        for days_before, notification_type in warning_intervals:
            # Find users who should receive this warning (exact date match)
            target_date = today + timedelta(days=days_before)

            users_query = f"""
            SELECT u."id", u."name", u."scheduledDeletionAt"
            FROM "User" u
            WHERE u."scheduledDeletionAt" = %s
                AND {_STILL_INACTIVE}
                AND NOT EXISTS (
                    SELECT 1 FROM "Notification" n
                    WHERE n."userId" = u."id"
                        AND n."type" = %s
                        AND n."createdAt" > (u."scheduledDeletionAt" - INTERVAL '{_NOTICE_DAYS} days')
                )
            """

            users = run_db_query(users_query, (target_date, notification_type))

            # Create notifications for these users
            for user in users:
                insert_notification_query = """
                INSERT INTO "Notification" ("userId", "type", "createdAt", "updatedAt")
                VALUES (%s, %s, NOW(), NOW())
                ON CONFLICT DO NOTHING
                """

                execute_db_command(
                    insert_notification_query, (user["id"], notification_type)
                )
                notifications_sent += 1

                self.logger.info(
                    f"Sent {notification_type} notification to user {user['name']} "
                    f"(ID: {user['id']}) scheduled for deletion on {user['scheduledDeletionAt']}"
                )

        return notifications_sent

    def _delete_scheduled_accounts(self) -> int:
        """
        Delete accounts that have reached their scheduled deletion date and are still inactive.
        """
        today = date.today()

        # Find users scheduled for deletion who are still inactive
        users_to_delete_query = f"""
        SELECT u."id", u."name", u."scheduledDeletionAt"
        FROM "User" u
        WHERE u."scheduledDeletionAt" <= %s
            AND {_STILL_INACTIVE}
        """

        users_to_delete = run_db_query(users_to_delete_query, (today,))
        deleted_count = 0

        for user in users_to_delete:
            try:
                delete_user_account(user["id"])
                deleted_count += 1

                self.logger.info(
                    f"Deleted inactive user {user['name']} (ID: {user['id']}) "
                    f"scheduled for deletion on {user['scheduledDeletionAt']}"
                )

            except Exception as e:
                self.logger.error(
                    f"Failed to delete user {user['name']} (ID: {user['id']}): {e}"
                )

        return deleted_count

    def _cancel_deletion_for_active_users(self) -> int:
        """
        Cancel scheduled deletion for users who have become active again.
        """
        query = f"""
        UPDATE "User"
        SET "scheduledDeletionAt" = NULL, "updatedAt" = NOW()
        WHERE "id" IN (
            SELECT u."id"
            FROM "User" u
            WHERE u."scheduledDeletionAt" IS NOT NULL
                AND NOT ({_STILL_INACTIVE})
        )
        """

        count = execute_db_command(query)
        if count > 0:
            self.logger.info(
                f"Cancelled deletion for {count} users who became active again or gained karma"
            )

        return count
