"""
Command line interface for the pyworker package.
"""

import argparse
import logging
import sys
import time
from functools import partial
from typing import List, Optional, Dict, Any

from pyworker.config import config
from pyworker.database import (
    claim_next_scan_job,
    close_db_pool,
    fetch_all_services,
    fetch_services_with_pending_comments,
    mark_scan_job_done,
)
from pyworker.scheduler import TaskScheduler
from .tasks import (
    CommentModerationTask,
    ContactCleanupTask,
    DeepScanTask,
    ForceTriggersTask,
    InactiveUsersTask,
    ServiceScoreRecalculationTask,
    TosReviewTask,
    UserSentimentTask,
)
from pyworker.utils.app_logging import configure_logging

configure_logging()
logger = logging.getLogger(__name__)

_DISABLED_SCHEDULE_VALUES = {"", "disabled", "off", "false", "none"}
_TASKS_WITHOUT_SCHEDULER_INSTANCE = {"deep_scan", "service_score_recalc_all"}


def is_disabled_schedule(schedule: str) -> bool:
    """Return true when a cron env value intentionally disables a task."""
    return schedule.strip().lower() in _DISABLED_SCHEDULE_VALUES


def should_use_scheduler_task_instance(task_name: str) -> bool:
    """Return true when TaskScheduler should instantiate the task class."""
    return task_name not in _TASKS_WITHOUT_SCHEDULER_INSTANCE


def group_task_schedules(task_schedules: dict[str, str]) -> tuple[dict[str, str], list[str]]:
    """Split cron schedules into enabled and intentionally disabled groups."""
    enabled_task_schedules = {
        task_name: schedule
        for task_name, schedule in task_schedules.items()
        if not is_disabled_schedule(schedule)
    }
    disabled_task_names = [
        task_name
        for task_name, schedule in task_schedules.items()
        if is_disabled_schedule(schedule)
    ]
    return enabled_task_schedules, disabled_task_names


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

    # Inactive users task
    subparsers.add_parser(
        "inactive-users",
        help="Handle inactive users - send deletion warnings and clean up accounts",
    )

    # Contact cleanup task
    subparsers.add_parser(
        "contact-cleanup",
        help="Delete resolved contact threads past their 30-day retention window",
    )

    # Deep scan task
    deep_scan_parser = subparsers.add_parser(
        "deep-scan",
        help="Deep-scan a service (TOS + KYC + attribute proposals + warnings)",
    )
    deep_scan_parser.add_argument(
        "--service-id",
        type=int,
        help="Specific service ID to scan. If omitted, drains the ServiceScanJob queue.",
    )

    return parser.parse_args(args)


def run_tos_task(service_id: Optional[int] = None, close_pool: bool = True) -> int:
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
        if close_pool:
            # Ensure connection pool is closed even if an error occurs
            close_db_pool()


def run_sentiment_task(
    service_id: Optional[int] = None, close_pool: bool = True
) -> int:
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
        if close_pool:
            # Ensure connection pool is closed even if an error occurs
            close_db_pool()


def run_moderation_task(
    service_id: Optional[int] = None, close_pool: bool = True
) -> int:
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
        if close_pool:
            # Ensure connection pool is closed even if an error occurs
            close_db_pool()


def run_force_triggers_task(close_pool: bool = True) -> int:
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
        if close_pool:
            # Ensure connection pool is closed even if an error occurs
            close_db_pool()


def run_service_score_recalc_task(
    service_id: Optional[int] = None,
    all_services: bool = False,
    close_pool: bool = True,
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
        if close_pool:
            # Ensure connection pool is closed even if an error occurs
            close_db_pool()


def run_service_score_recalc_all_task(close_pool: bool = True) -> int:
    """
    Run the service score recalculation task for all services.
    """
    return run_service_score_recalc_task(all_services=True, close_pool=close_pool)


def run_deep_scan_task(
    service_id: Optional[int] = None, close_pool: bool = True
) -> int:
    """Run the deep scan task.

    With service_id: scan that single service once, ignoring the queue.
    Without: drain the ServiceScanJob queue, claiming one job at a time. The
    worker-mode scheduler ticks this on a short cron so admin clicks turn into
    scans within a minute or so.
    """
    logger.info("Starting deep scan task")

    try:
        if service_id is not None:
            with DeepScanTask() as task:  # type: ignore
                suggestion_id = task.run(service_id)  # type: ignore
                if suggestion_id:
                    logger.info(
                        f"Deep scan completed for service {service_id}, "
                        f"suggestion #{suggestion_id} created"
                    )
                else:
                    logger.warning(
                        f"Deep scan produced no suggestion for service {service_id}"
                    )
            return 0

        processed = 0
        with DeepScanTask() as task:  # type: ignore
            while True:
                job = claim_next_scan_job()
                if job is None:
                    break

                job_id = int(job["id"])
                job_service_id = int(job["serviceId"])
                logger.info(
                    f"Claimed scan job {job_id} for service {job_service_id}"
                )

                try:
                    suggestion_id = task.run(job_service_id)  # type: ignore
                    error_msg: Optional[str] = None
                    if suggestion_id is None:
                        error_msg = (
                            "Deep scan produced no suggestion (empty corpus, "
                            "filtered pages, or LLM rejection)"
                        )
                    mark_scan_job_done(job_id, error=error_msg)
                except Exception as e:
                    logger.exception(
                        f"Deep scan job {job_id} failed for service {job_service_id}: {e}"
                    )
                    mark_scan_job_done(job_id, error=str(e))
                processed += 1

        logger.info(f"Deep scan task drained {processed} job(s)")
        return 0
    finally:
        if close_pool:
            close_db_pool()


def run_inactive_users_task(close_pool: bool = True) -> int:
    """
    Run the inactive users task.

    Returns:
        Exit code.
    """
    logger.info("Starting inactive users task")

    try:
        # Initialize task and use as context manager
        with InactiveUsersTask() as task:  # type: ignore
            result = task.run()  # type: ignore
            logger.info(f"Inactive users task completed. Results: {result}")

        return 0
    except Exception as e:
        logger.exception(f"Error running inactive users task: {e}")
        return 1
    finally:
        if close_pool:
            # Ensure connection pool is closed even if an error occurs
            close_db_pool()


def run_contact_cleanup_task(close_pool: bool = True) -> int:
    """
    Run the contact cleanup task.

    Returns:
        Exit code.
    """
    logger.info("Starting contact cleanup task")

    try:
        with ContactCleanupTask() as task:  # type: ignore
            result = task.run()  # type: ignore
            logger.info(f"Contact cleanup task completed. Results: {result}")

        return 0
    except Exception as e:
        logger.exception(f"Error running contact cleanup task: {e}")
        return 1
    finally:
        if close_pool:
            close_db_pool()


def run_worker_mode() -> int:
    """
    Run in worker mode, scheduling tasks to run periodically.

    Returns:
        Exit code.
    """
    logger.info("Starting worker mode")

    # Get task schedules from config
    task_schedules = config.task_schedules
    enabled_task_schedules, disabled_task_names = group_task_schedules(task_schedules)
    logger.info(
        "Found %s enabled cron schedule%s from environment variables: %s",
        len(enabled_task_schedules),
        "s" if len(enabled_task_schedules) != 1 else "",
        ", ".join(enabled_task_schedules.keys()) if enabled_task_schedules else "<none>",
    )
    if disabled_task_names:
        logger.info("Disabled cron task schedules: %s", ", ".join(disabled_task_names))

    task_callables: dict[str, Any] = {
        "tosreview": partial(run_tos_task, close_pool=False),
        "user_sentiment": partial(run_sentiment_task, close_pool=False),
        "comment_moderation": partial(run_moderation_task, close_pool=False),
        "force_triggers": partial(run_force_triggers_task, close_pool=False),
        "inactive_users": partial(run_inactive_users_task, close_pool=False),
        "contact_cleanup": partial(run_contact_cleanup_task, close_pool=False),
        "service_score_recalc": partial(
            run_service_score_recalc_task, close_pool=False
        ),
        "service_score_recalc_all": partial(
            run_service_score_recalc_all_task, close_pool=False
        ),
        "deep_scan": partial(run_deep_scan_task, close_pool=False),
    }
    scheduler = TaskScheduler()

    for task_name, schedule in enabled_task_schedules.items():
        task_callable = task_callables.get(task_name)
        if task_callable is None:
            logger.warning("Ignoring unknown cron task schedule: %s", task_name)
            continue
        scheduler.register_task(
            task_name,
            schedule,
            task_callable,
            instantiate=should_use_scheduler_task_instance(task_name),
        )

    # Start the scheduler if tasks were registered
    if scheduler.tasks:
        exit_code = 0
        try:
            scheduler.start()
            logger.info("Worker started, press Ctrl+C to stop")

            # Keep the main thread alive
            while scheduler.is_running():
                time.sleep(1)
        except KeyboardInterrupt:
            logger.info("Keyboard interrupt received, shutting down...")
        except Exception as e:
            logger.exception(f"Error in worker mode: {e}")
            exit_code = 1
        finally:
            scheduler.stop()
        return exit_code
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
        elif args.task == "inactive-users":
            return run_inactive_users_task()
        elif args.task == "contact-cleanup":
            return run_contact_cleanup_task()
        elif args.task == "deep-scan":
            return run_deep_scan_task(args.service_id)
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
