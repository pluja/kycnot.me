"""
Command line interface for the pyworker package.
"""

import argparse
import sys
import time
from typing import List, Optional, Dict, Any

from pyworker.config import config
from pyworker.database import (
    close_db_pool,
    fetch_all_services,
    fetch_services_with_pending_comments,
)
from pyworker.scheduler import TaskScheduler
from .tasks import (
    CommentModerationTask,
    ForceTriggersTask,
    ServiceScoreRecalculationTask,
    TosReviewTask,
    UserSentimentTask,
)
from pyworker.utils.app_logging import setup_logging

logger = setup_logging(__name__)


def parse_args(args: List[str]) -> argparse.Namespace:
    """
    Parse command line arguments.

    Args:
        args: Command line arguments.

    Returns:
        Parsed arguments.
    """
    parser = argparse.ArgumentParser(description="KYC Not Worker")

    # Global options
    parser.add_argument(
        "--worker",
        action="store_true",
        help="Run in worker mode (schedule tasks to run periodically)",
    )

    # Add subparsers for different tasks
    subparsers = parser.add_subparsers(dest="task", help="Task to run")

    # TOS retrieval task
    tos_parser = subparsers.add_parser(
        "tos", help="Retrieve Terms of Service (TOS) text"
    )
    tos_parser.add_argument(
        "--service-id", type=int, help="Specific service ID to process (optional)"
    )

    # User sentiment task
    sentiment_parser = subparsers.add_parser(
        "sentiment", help="Analyze user sentiment from comments"
    )
    sentiment_parser.add_argument(
        "--service-id", type=int, help="Specific service ID to process (optional)"
    )

    # Comment moderation task
    moderation_parser = subparsers.add_parser(
        "moderation", help="Moderate pending comments"
    )
    moderation_parser.add_argument(
        "--service-id", type=int, help="Specific service ID to process (optional)"
    )

    # New Service Penalty task
    penalty_parser = subparsers.add_parser(
        "force-triggers",
        help="Force triggers to run under certain conditions",
    )
    penalty_parser.add_argument(
        "--service-id", type=int, help="Specific service ID to process (optional)"
    )

    # Service Score Recalculation task
    score_recalc_parser = subparsers.add_parser(
        "service-score-recalc",
        help="Recalculate service scores based on attribute changes",
    )
    score_recalc_parser.add_argument(
        "--service-id", type=int, help="Specific service ID to process (optional)"
    )
    score_recalc_parser.add_argument(
        "--all",
        action="store_true",
        help="Recalculate scores for all services (ignores --service-id)",
    )

    # Service Score Recalculation task for all services
    subparsers.add_parser(
        "service-score-recalc-all",
        help="Recalculate service scores for all services",
    )

    return parser.parse_args(args)


def run_tos_task(service_id: Optional[int] = None) -> int:
    """
    Run the TOS retrieval task.

    Args:
        service_id: Optional specific service ID to process.

    Returns:
        Exit code.
    """
    logger.info("Starting TOS retrieval task")

    try:
        # Fetch services
        services = fetch_all_services()
        if not services:
            logger.error("No services found")
            return 1

        # Filter by service ID if specified
        if service_id:
            services = [s for s in services if s["id"] == service_id]
            if not services:
                logger.error(f"Service with ID {service_id} not found")
                return 1

        # Initialize task and use as context manager
        with TosReviewTask() as task:  # type: ignore
            # Process services using the same database connection
            for service in services:
                if not service.get("tosUrls"):
                    logger.info(
                        f"Skipping service {service['name']} (ID: {service['id']}) - no TOS URLs"
                    )
                    continue

                result = task.run(service)  # type: ignore
                if result:
                    logger.info(
                        f"Successfully retrieved TOS for service {service['name']}"
                    )
                else:
                    logger.warning(
                        f"Failed to retrieve TOS for service {service['name']}"
                    )

        logger.info("TOS retrieval task completed")
        return 0
    finally:
        # Ensure connection pool is closed even if an error occurs
        close_db_pool()


def run_sentiment_task(service_id: Optional[int] = None) -> int:
    """
    Run the user sentiment analysis task.

    Args:
        service_id: Optional specific service ID to process.

    Returns:
        Exit code.
    """
    logger.info("Starting user sentiment analysis task")

    try:
        # Fetch services
        services = fetch_all_services()
        if not services:
            logger.error("No services found")
            return 1

        # Filter by service ID if specified
        if service_id:
            services = [s for s in services if s["id"] == service_id]
            if not services:
                logger.error(f"Service with ID {service_id} not found")
                return 1

        # Initialize task and use as context manager
        with UserSentimentTask() as task:  # type: ignore
            # Process services using the same database connection
            for service in services:
                result = task.run(service)  # type: ignore
                if result is not None:
                    logger.info(
                        f"Successfully analyzed sentiment for service {service['name']}"
                    )

        logger.info("User sentiment analysis task completed")
        return 0
    finally:
        # Ensure connection pool is closed even if an error occurs
        close_db_pool()


def run_moderation_task(service_id: Optional[int] = None) -> int:
    """
    Run the comment moderation task.

    Args:
        service_id: Optional specific service ID to process.

    Returns:
        Exit code.
    """
    logger.info("Starting comment moderation task")

    try:
        services_to_process: List[Dict[str, Any]] = []
        if service_id:
            # Fetch specific service if ID is provided
            # Consider creating a fetch_service_by_id for efficiency if this path is common
            all_services = fetch_all_services()
            services_to_process = [s for s in all_services if s["id"] == service_id]
            if not services_to_process:
                logger.error(
                    f"Service with ID {service_id} not found or does not meet general fetch criteria."
                )
                return 1
            logger.info(f"Processing specifically for service ID: {service_id}")
        else:
            # No specific service ID, fetch only services with pending comments
            logger.info(
                "No specific service ID provided. Querying for services with pending comments."
            )
            services_to_process = fetch_services_with_pending_comments()
            if not services_to_process:
                logger.info(
                    "No services found with pending comments for moderation at this time."
                )
                # Task completed its check, nothing to do.
                # Fall through to common completion log.

        any_service_had_comments_processed = False
        if not services_to_process and not service_id:
            # This case is when no service_id was given AND no services with pending comments were found.
            # Already logged above.
            pass
        elif not services_to_process and service_id:
            # This case should have been caught by the 'return 1' if service_id was specified but not found.
            # If it reaches here, it implies an issue or the service had no pending comments (which the task will handle).
            logger.info(
                f"Service ID {service_id} was specified, but no matching service found or it has no pending items for the task."
            )
        else:
            logger.info(
                f"Identified {len(services_to_process)} service(s) to check for comment moderation."
            )

        # Initialize task and use as context manager
        with CommentModerationTask() as task:  # type: ignore
            for service in services_to_process:
                # The CommentModerationTask.run() method now returns a boolean
                # and handles its own logging regarding finding/processing comments for the service.
                if task.run(service):  # type: ignore
                    logger.info(
                        f"Comment moderation task ran for service {service['name']} (ID: {service['id']}) and processed comments."
                    )
                    any_service_had_comments_processed = True
                else:
                    logger.info(
                        f"Comment moderation task ran for service {service['name']} (ID: {service['id']}), but no new comments were moderated."
                    )

            if services_to_process and not any_service_had_comments_processed:
                logger.info(
                    "Completed iterating through services; no comments were moderated in this run."
                )

        logger.info("Comment moderation task completed")
        return 0
    finally:
        # Ensure connection pool is closed even if an error occurs
        close_db_pool()


def run_force_triggers_task() -> int:
    """
    Runs the force triggers task.

    Returns:
        Exit code.
    """
    logger.info("Starting force triggers task")

    try:
        # Initialize task and use as context manager
        with ForceTriggersTask() as task:  # type: ignore
            success = task.run()  # type: ignore

        if success:
            logger.info("Force triggers task completed successfully.")
            return 0
        else:
            logger.error("Force triggers task failed.")
            return 1
    finally:
        # Ensure connection pool is closed even if an error occurs
        close_db_pool()


def run_service_score_recalc_task(
    service_id: Optional[int] = None, all_services: bool = False
) -> int:
    """
    Run the service score recalculation task.

    Args:
        service_id: Optional specific service ID to process.
        all_services: Whether to recalculate scores for all services.

    Returns:
        Exit code.
    """
    logger.info("Starting service score recalculation task")

    try:
        # Initialize task and use as context manager
        with ServiceScoreRecalculationTask() as task:  # type: ignore
            if all_services:
                queued = task.recalculate_all_services()  # type: ignore
                if not queued:
                    logger.warning(
                        "Failed to queue recalculation jobs for all services"
                    )

                # Continuously process queued jobs in batches until none remain
                while True:
                    _ = task.run()  # type: ignore

                    # Check if there are still unprocessed jobs
                    remaining = 0
                    if task.conn:
                        with task.conn.cursor() as cursor:
                            cursor.execute(
                                'SELECT COUNT(*) FROM "ServiceScoreRecalculationJob" WHERE "processedAt" IS NULL'
                            )
                            remaining = cursor.fetchone()[0]

                    if remaining == 0:
                        break

                result = True  # All jobs processed successfully

            else:
                result = task.run(service_id)  # type: ignore

            if result:
                logger.info("Successfully recalculated service scores")
            else:
                logger.warning("Failed to recalculate service scores")

        logger.info("Service score recalculation task completed")
        return 0
    finally:
        # Ensure connection pool is closed even if an error occurs
        close_db_pool()


def run_service_score_recalc_all_task() -> int:
    """
    Run the service score recalculation task for all services.
    """
    return run_service_score_recalc_task(all_services=True)


def run_worker_mode() -> int:
    """
    Run in worker mode, scheduling tasks to run periodically.

    Returns:
        Exit code.
    """
    logger.info("Starting worker mode")

    # Get task schedules from config
    task_schedules = config.task_schedules
    if not task_schedules:
        logger.error(
            "No task schedules defined. Set CRON_TASKNAME_TASK environment variables."
        )
        return 1

    logger.info(
        f"Found {len(task_schedules)} scheduled tasks: {', '.join(task_schedules.keys())}"
    )

    # Initialize the scheduler
    scheduler = TaskScheduler()

    # Register tasks with their schedules
    for task_name, cron_expression in task_schedules.items():
        if task_name.lower() == "tosreview":
            scheduler.register_task(task_name, cron_expression, run_tos_task)
        elif task_name.lower() == "user_sentiment":
            scheduler.register_task(task_name, cron_expression, run_sentiment_task)
        elif task_name.lower() == "comment_moderation":
            scheduler.register_task(task_name, cron_expression, run_moderation_task)
        elif task_name.lower() == "force_triggers":
            scheduler.register_task(task_name, cron_expression, run_force_triggers_task)
        elif task_name.lower() == "service_score_recalc":
            scheduler.register_task(
                task_name, cron_expression, run_service_score_recalc_task
            )
        elif task_name.lower() == "service_score_recalc_all":
            scheduler.register_task(
                task_name,
                cron_expression,
                run_service_score_recalc_all_task,
            )
        else:
            logger.warning(f"Unknown task '{task_name}', skipping")

    # Register service score recalculation task (every 5 minutes)
    scheduler.register_task(
        "service_score_recalc",
        "*/5 * * * *",
        run_service_score_recalc_task,
    )
    # Register daily service score recalculation for all services
    scheduler.register_task(
        "service_score_recalc_all",
        "0 0 * * *",
        run_service_score_recalc_all_task,
    )

    # Start the scheduler if tasks were registered
    if scheduler.tasks:
        try:
            scheduler.start()
            logger.info("Worker started, press Ctrl+C to stop")

            # Keep the main thread alive
            while scheduler.is_running():
                time.sleep(1)

            return 0
        except KeyboardInterrupt:
            logger.info("Keyboard interrupt received, shutting down...")
            scheduler.stop()
            return 0
        except Exception as e:
            logger.exception(f"Error in worker mode: {e}")
            scheduler.stop()
            return 1
    else:
        logger.error("No valid tasks registered")
        return 1


def main() -> int:
    """
    Main entry point.

    Returns:
        Exit code.
    """
    args = parse_args(sys.argv[1:])

    try:
        # If worker mode is specified, run the scheduler
        if args.worker:
            return run_worker_mode()

        # Otherwise, run the specified task once
        if args.task == "tos":
            return run_tos_task(args.service_id)
        elif args.task == "sentiment":
            return run_sentiment_task(args.service_id)
        elif args.task == "moderation":
            return run_moderation_task(args.service_id)
        elif args.task == "force-triggers":
            return run_force_triggers_task()
        elif args.task == "service-score-recalc":
            return run_service_score_recalc_task(
                args.service_id, getattr(args, "all", False)
            )
        elif args.task == "service-score-recalc-all":
            return run_service_score_recalc_all_task()
        elif args.task:
            logger.error(f"Unknown task: {args.task}")
            return 1
        else:
            logger.error(
                "No task specified. Use --worker for scheduled execution or specify a task to run once."
            )
            return 1
    except Exception as e:
        logger.exception(f"Error running task: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
