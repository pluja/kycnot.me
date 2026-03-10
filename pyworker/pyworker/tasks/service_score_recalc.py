"""
Task to recalculate service scores based on attribute changes.
"""

from typing import Optional

from pyworker.tasks.base import Task
import logging

logger = logging.getLogger(__name__)


class ServiceScoreRecalculationTask(Task):
    """
    Process pending service score recalculation jobs.

    This task fetches jobs from the ServiceScoreRecalculationJob table
    and recalculates service scores using the PostgreSQL functions.
    """

    def __init__(self):
        super().__init__("service_score_recalc")

    def run(self, service_id: Optional[int] = None) -> bool:
        """
        Process score recalculation jobs from the ServiceScoreRecalculationJob table.

        Args:
            service_id: Optional service ID to process only that specific service

        Returns:
            bool: True if successful, False otherwise
        """
        logger.info(f"Starting {self.name} task.")
        processed_count = 0
        error_count = 0
        batch_size = 50

        # Use the connection provided by the base Task class
        if not self.conn:
            logger.error("No database connection available")
            return False

        try:
            # Build query - either for a specific service or all pending jobs
            if service_id:
                select_query = """
                    SELECT id, "serviceId"
                    FROM "ServiceScoreRecalculationJob"
                    WHERE "serviceId" = %s AND "processedAt" IS NULL
                    ORDER BY "createdAt" ASC
                """
                params = [service_id]
            else:
                select_query = """
                    SELECT id, "serviceId"
                    FROM "ServiceScoreRecalculationJob"
                    WHERE "processedAt" IS NULL
                    ORDER BY "createdAt" ASC
                    LIMIT %s
                """
                params = [batch_size]

            # Fetch jobs
            with self.conn.cursor() as cursor:
                cursor.execute(select_query, params)
                unprocessed_jobs = cursor.fetchall()

            if not unprocessed_jobs:
                logger.info("No pending service score recalculation jobs found.")
                return True

            logger.info(
                f"Processing {len(unprocessed_jobs)} service score recalculation jobs."
            )

            # Process each job
            for job in unprocessed_jobs:
                job_id = job[0]  # First column is id
                svc_id = job[1]  # Second column is serviceId

                try:
                    self._process_service_score(svc_id, job_id)
                    processed_count += 1
                    logger.debug(
                        f"Successfully processed job {job_id} for service {svc_id}"
                    )
                except Exception as e:
                    if self.conn:
                        self.conn.rollback()
                    error_count += 1
                    logger.error(
                        f"Error processing job {job_id} for service {svc_id}: {str(e)}",
                        exc_info=True,
                    )

            logger.info(
                f"{self.name} task completed. Processed: {processed_count}, Errors: {error_count}"
            )
            return processed_count > 0 or error_count == 0

        except Exception as e:
            if self.conn:
                self.conn.rollback()
            logger.error(f"Failed to run {self.name} task: {str(e)}", exc_info=True)
            return False

    def _process_service_score(self, service_id: int, job_id: int) -> None:
        """
        Process a single service score recalculation job.

        Args:
            service_id: The service ID to recalculate scores for
            job_id: The job ID to mark as processed
        """
        if not self.conn:
            raise ValueError("No database connection available")

        with self.conn.cursor() as cursor:
            # 1. Calculate privacy score
            cursor.execute("SELECT calculate_privacy_score(%s)", [service_id])
            privacy_score = cursor.fetchone()[0]

            # 2. Calculate trust score
            cursor.execute("SELECT calculate_trust_score(%s)", [service_id])
            trust_score = cursor.fetchone()[0]

            # 3. Calculate overall score
            cursor.execute(
                "SELECT calculate_overall_score(%s, %s, %s)",
                [service_id, privacy_score, trust_score],
            )
            overall_score = cursor.fetchone()[0]

            # 4. Check for verification status and cap score if needed
            cursor.execute(
                'SELECT "verificationStatus" FROM "Service" WHERE id = %s',
                [service_id],
            )
            result = cursor.fetchone()
            if result is None:
                logger.warning(
                    f"Service with ID {service_id} not found. Deleting job {job_id}."
                )
                # Delete the job if the service is gone
                cursor.execute(
                    """
                    DELETE FROM "ServiceScoreRecalculationJob"
                    WHERE id = %s
                    """,
                    [job_id],
                )
                self.conn.commit()
                return  # Skip the rest of the processing for this job

            status = result[0]

            if status == "VERIFICATION_FAILED":
                if overall_score > 3:
                    overall_score = 3
                elif overall_score < 0:
                    overall_score = 0

            # 5. Update the service with recalculated scores
            cursor.execute(
                """
                UPDATE "Service" 
                SET "privacyScore" = %s, "trustScore" = %s, "overallScore" = %s
                WHERE id = %s
                """,
                [privacy_score, trust_score, overall_score, service_id],
            )

            # 6. Mark the job as processed
            cursor.execute(
                """
                UPDATE "ServiceScoreRecalculationJob"
                SET "processedAt" = NOW()
                WHERE id = %s
                """,
                [job_id],
            )

        # Commit the transaction
        if self.conn:
            self.conn.commit()

    def recalculate_all_services(self) -> bool:
        """
        Recalculate scores for all active services.
        Useful for batch updates after attribute changes.

        Returns:
            bool: True if successful, False otherwise
        """
        logger.info("Starting recalculation for all active services.")

        if not self.conn:
            logger.error("No database connection available")
            return False

        try:
            # Get all active service IDs
            with self.conn.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT id 
                    FROM "Service"
                    """
                )
                services = cursor.fetchall()

            if not services:
                logger.info("No active services found.")
                return True

            logger.info(f"Found {len(services)} active services to recalculate.")

            # Queue recalculation jobs for all services
            inserted_count = 0
            for service in services:
                service_id = service[0]
                try:
                    if self.conn:
                        with self.conn.cursor() as cursor:
                            cursor.execute(
                                """
                                INSERT INTO "ServiceScoreRecalculationJob" ("serviceId", "createdAt", "processedAt")
                                VALUES (%s, NOW(), NULL)
                                ON CONFLICT ("serviceId") DO UPDATE 
                                SET "processedAt" = NULL, "createdAt" = NOW()
                                """,
                                [service_id],
                            )
                        self.conn.commit()
                        inserted_count += 1
                except Exception as e:
                    if self.conn:
                        self.conn.rollback()
                    logger.error(
                        f"Error queueing job for service {service_id}: {str(e)}"
                    )

            logger.info(f"Successfully queued {inserted_count} recalculation jobs.")
            return True

        except Exception as e:
            if self.conn:
                self.conn.rollback()
            logger.error(f"Failed to queue recalculation jobs: {str(e)}", exc_info=True)
            return False

    def recalculate_for_attribute(self, attribute_id: int) -> bool:
        """
        Recalculate scores for all services associated with a specific attribute.

        Args:
            attribute_id: The attribute ID to recalculate scores for

        Returns:
            bool: True if successful, False otherwise
        """
        logger.info(
            f"Starting recalculation for services with attribute ID {attribute_id}."
        )

        if not self.conn:
            logger.error("No database connection available")
            return False

        try:
            # Get all services associated with this attribute
            with self.conn.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT DISTINCT sa."serviceId"
                    FROM "ServiceAttribute" sa
                    WHERE sa."attributeId" = %s
                    """,
                    [attribute_id],
                )
                services = cursor.fetchall()

            if not services:
                logger.info(f"No services found with attribute ID {attribute_id}.")
                return True

            logger.info(
                f"Found {len(services)} services with attribute ID {attribute_id}."
            )

            # Queue recalculation jobs for all services with this attribute
            inserted_count = 0
            for service in services:
                service_id = service[0]
                try:
                    if self.conn:
                        with self.conn.cursor() as cursor:
                            cursor.execute(
                                """
                                INSERT INTO "ServiceScoreRecalculationJob" ("serviceId", "createdAt", "processedAt")
                                VALUES (%s, NOW(), NULL)
                                ON CONFLICT ("serviceId") DO UPDATE 
                                SET "processedAt" = NULL, "createdAt" = NOW()
                                """,
                                [service_id],
                            )
                        self.conn.commit()
                        inserted_count += 1
                except Exception as e:
                    if self.conn:
                        self.conn.rollback()
                    logger.error(
                        f"Error queueing job for service {service_id}: {str(e)}"
                    )

            logger.info(f"Successfully queued {inserted_count} recalculation jobs.")
            return True

        except Exception as e:
            if self.conn:
                self.conn.rollback()
            logger.error(f"Failed to queue recalculation jobs: {str(e)}", exc_info=True)
            return False
