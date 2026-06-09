"""
Task for deleting resolved contact threads past their retention window.

Resolved conversations are kept for 30 days, then permanently removed. This
deletion is the privacy mechanism for the contact feature (the data ceases to
exist); messages cascade with the thread.
"""

from typing import Any, Dict

from pyworker.database import execute_db_command
from pyworker.tasks.base import Task

RETENTION_DAYS = 30


class ContactCleanupTask(Task):
    """Task for purging old resolved contact threads."""

    def __init__(self):
        """Initialize the contact cleanup task."""
        super().__init__("contact_cleanup")

    def run(self) -> Dict[str, Any]:
        """Delete resolved contact threads older than the retention window."""
        query = f"""
        DELETE FROM "ContactThread"
        WHERE "status" = 'RESOLVED'
            AND "resolvedAt" IS NOT NULL
            AND "resolvedAt" < NOW() - INTERVAL '{RETENTION_DAYS} days'
        """
        deleted = execute_db_command(query)
        self.logger.info(
            f"Contact cleanup deleted {deleted} resolved thread(s) older than {RETENTION_DAYS} days"
        )
        return {"threads_deleted": deleted}
