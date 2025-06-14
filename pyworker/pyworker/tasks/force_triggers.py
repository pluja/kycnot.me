from pyworker.tasks.base import Task
from pyworker.utils.app_logging import setup_logging

logger = setup_logging(__name__)


class ForceTriggersTask(Task):
    """
    Force triggers to run under certain conditions.
    """

    RECENT_APPROVED_INTERVAL_DAYS = 15

    def __init__(self):
        super().__init__("force_triggers")

    def run(self) -> bool:
        logger.info(f"Starting {self.name} task.")

        # Use the connection provided by the base Task class
        if not self.conn:
            logger.error("No database connection available")
            return False

        update_query = f"""
        UPDATE "Service"
        SET "isRecentlyApproved" = FALSE, "updatedAt" = NOW()
        WHERE "isRecentlyApproved" = TRUE
        AND "approvedAt" IS NOT NULL
        AND "approvedAt" < NOW() - INTERVAL '{self.RECENT_APPROVED_INTERVAL_DAYS} days'
        """
        try:
            with self.conn.cursor() as cursor:
                cursor.execute(update_query)
                self.conn.commit()
                added_count = cursor.rowcount
                logger.info(f"Updated {added_count} services.")
        except Exception as e:
            logger.error(f"Error updating services: {e}")
            return False

        logger.info(f"{self.name} task completed successfully.")
        return True
