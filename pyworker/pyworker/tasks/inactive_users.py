"""
Task for handling inactive users - sending deletion warnings and cleaning up accounts.
"""

from datetime import datetime, timedelta, date
from typing import Any, Dict

from pyworker.database import execute_db_command, run_db_query
from pyworker.tasks.base import Task


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

        A user is considered inactive if:
        - Account was created more than 1 year ago
        - Has 0 karma
        - Has no comments, comment votes, or service suggestions
        - Is not scheduled for deletion already
        - Is not an admin or moderator
        """
        one_year_ago = datetime.now() - timedelta(days=365)
        deletion_date = date.today() + timedelta(days=30)  # 30 days from today

        # Find inactive users
        query = """
        UPDATE "User" 
        SET "scheduledDeletionAt" = %s, "updatedAt" = NOW()
        WHERE "id" IN (
            SELECT u."id" 
            FROM "User" u
            WHERE u."createdAt" < %s
                AND u."scheduledDeletionAt" IS NULL
                AND u."admin" = false
                AND u."moderator" = false
                AND u."totalKarma" = 0
                AND NOT EXISTS (
                    SELECT 1 FROM "Comment" c WHERE c."authorId" = u."id"
                )
                AND NOT EXISTS (
                    SELECT 1 FROM "CommentVote" cv WHERE cv."userId" = u."id"
                )
                AND NOT EXISTS (
                    SELECT 1 FROM "ServiceSuggestion" ss WHERE ss."userId" = u."id"
                )
        )
        """

        count = execute_db_command(query, (deletion_date, one_year_ago))
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

            # Check if user is still inactive (no recent activity)
            users_query = """
            SELECT u."id", u."name", u."scheduledDeletionAt"
            FROM "User" u
            WHERE u."scheduledDeletionAt" = %s
                AND u."admin" = false
                AND u."moderator" = false
                AND u."totalKarma" = 0
                AND NOT EXISTS (
                    SELECT 1 FROM "Notification" n 
                    WHERE n."userId" = u."id" 
                        AND n."type" = %s 
                        AND n."createdAt" > (u."scheduledDeletionAt" - INTERVAL '30 days')
                )
                -- Still check if user is inactive (no activity since being scheduled)
                AND NOT EXISTS (
                    SELECT 1 FROM "Comment" c 
                    WHERE c."authorId" = u."id" 
                        AND c."createdAt" > (u."scheduledDeletionAt" - INTERVAL '30 days')
                )
                AND NOT EXISTS (
                    SELECT 1 FROM "CommentVote" cv 
                    WHERE cv."userId" = u."id" 
                        AND cv."createdAt" > (u."scheduledDeletionAt" - INTERVAL '30 days')
                )
                AND NOT EXISTS (
                    SELECT 1 FROM "ServiceSuggestion" ss 
                    WHERE ss."userId" = u."id" 
                        AND ss."createdAt" > (u."scheduledDeletionAt" - INTERVAL '30 days')
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
        users_to_delete_query = """
        SELECT u."id", u."name", u."scheduledDeletionAt"
        FROM "User" u
        WHERE u."scheduledDeletionAt" <= %s
            AND u."admin" = false
            AND u."moderator" = false
            AND u."totalKarma" = 0
            -- Double-check they're still inactive
            AND NOT EXISTS (
                SELECT 1 FROM "Comment" c 
                WHERE c."authorId" = u."id" 
                    AND c."createdAt" > (u."scheduledDeletionAt" - INTERVAL '30 days')
            )
            AND NOT EXISTS (
                SELECT 1 FROM "CommentVote" cv 
                WHERE cv."userId" = u."id" 
                    AND cv."createdAt" > (u."scheduledDeletionAt" - INTERVAL '30 days')
            )
            AND NOT EXISTS (
                SELECT 1 FROM "ServiceSuggestion" ss 
                WHERE ss."userId" = u."id" 
                    AND ss."createdAt" > (u."scheduledDeletionAt" - INTERVAL '30 days')
            )
        """

        users_to_delete = run_db_query(users_to_delete_query, (today,))
        deleted_count = 0

        for user in users_to_delete:
            try:
                # Delete the user (this will cascade and delete related records)
                delete_query = 'DELETE FROM "User" WHERE "id" = %s'
                execute_db_command(delete_query, (user["id"],))
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
        # Find users scheduled for deletion who have recent activity or gained karma
        query = """
        UPDATE "User" 
        SET "scheduledDeletionAt" = NULL, "updatedAt" = NOW()
        WHERE "scheduledDeletionAt" IS NOT NULL
            AND (
                "totalKarma" > 0
                OR EXISTS (
                    SELECT 1 FROM "Comment" c 
                    WHERE c."authorId" = "User"."id" 
                        AND c."createdAt" > ("User"."scheduledDeletionAt" - INTERVAL '30 days')
                )
                OR EXISTS (
                    SELECT 1 FROM "CommentVote" cv 
                    WHERE cv."userId" = "User"."id" 
                        AND cv."createdAt" > ("User"."scheduledDeletionAt" - INTERVAL '30 days')
                )
                OR EXISTS (
                    SELECT 1 FROM "ServiceSuggestion" ss 
                    WHERE ss."userId" = "User"."id" 
                        AND ss."createdAt" > ("User"."scheduledDeletionAt" - INTERVAL '30 days')
                )
            )
        """

        count = execute_db_command(query)
        if count > 0:
            self.logger.info(
                f"Cancelled deletion for {count} users who became active again or gained karma"
            )

        return count
