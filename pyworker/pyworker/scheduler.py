"""
Scheduler module for managing task execution with cron.
"""

import signal
import threading
from datetime import datetime
from types import FrameType
from typing import Any, Callable, Dict, List, ParamSpec, TypeVar

from croniter import croniter

from pyworker.database import close_db_pool
from .tasks import (
    CommentModerationTask,
    ForceTriggersTask,
    ServiceScoreRecalculationTask,
    TosReviewTask,
    UserSentimentTask,
)
from pyworker.utils.app_logging import setup_logging

logger = setup_logging(__name__)

P = ParamSpec("P")
R = TypeVar("R")


class TaskScheduler:
    """Task scheduler for running tasks on a cron schedule."""

    def __init__(self):
        """Initialize the task scheduler."""
        self.tasks: Dict[str, Dict[str, Any]] = {}
        self.running = False
        self.threads: List[threading.Thread] = []
        self.stop_event = threading.Event()
        self.logger = logger

        # Set up signal handlers
        signal.signal(signal.SIGINT, self._handle_signal)
        signal.signal(signal.SIGTERM, self._handle_signal)

    def _handle_signal(self, signum: int, frame: FrameType | None) -> None:
        """Handle termination signals."""
        self.logger.info(f"Received signal {signum}, shutting down...")
        self.stop()

    def register_task(
        self,
        task_name: str,
        cron_expression: str,
        task_func: Callable[P, R],
        *args: P.args,
        **kwargs: P.kwargs,
    ) -> None:
        """
        Register a task to be scheduled.

        Args:
            task_name: Name of the task.
            cron_expression: Cron expression defining the schedule.
            task_func: Function to execute.
            *args: Arguments to pass to the task function.
            **kwargs: Keyword arguments to pass to the task function.
        """
        # Declare task_instance variable with type annotation upfront
        task_instance: Any = None

        # Initialize the appropriate task class based on the task name
        if task_name.lower() == "tosreview":
            task_instance = TosReviewTask()
        elif task_name.lower() == "user_sentiment":
            task_instance = UserSentimentTask()
        elif task_name.lower() == "comment_moderation":
            task_instance = CommentModerationTask()
        elif task_name.lower() == "force_triggers":
            task_instance = ForceTriggersTask()
        elif task_name.lower() == "service_score_recalc":
            task_instance = ServiceScoreRecalculationTask()
        else:
            self.logger.warning(f"Unknown task '{task_name}', skipping")
            return

        self.tasks[task_name] = {
            "cron": cron_expression,
            "func": task_func,
            "instance": task_instance,
            "args": args,
            "kwargs": kwargs,
        }
        self.logger.info(
            f"Registered task '{task_name}' with schedule: {cron_expression}"
        )

    def _run_task(self, task_name: str, task_info: Dict[str, Any]):
        """
        Run a task on its schedule.

        Args:
            task_name: Name of the task.
            task_info: Task information including function and schedule.
        """
        self.logger.info(f"Starting scheduler for task '{task_name}'")

        # Parse the cron expression
        cron = croniter(task_info["cron"], datetime.now())

        while not self.stop_event.is_set():
            # Get the next run time
            next_run = cron.get_next(datetime)
            self.logger.info(f"Next run for task '{task_name}': {next_run}")

            # Sleep until the next run time
            now = datetime.now()
            sleep_seconds = (next_run - now).total_seconds()

            if sleep_seconds > 0:
                # Wait until next run time or until stop event is set
                if self.stop_event.wait(sleep_seconds):
                    break

            # Run the task if we haven't been stopped
            if not self.stop_event.is_set():
                try:
                    self.logger.info(f"Running task '{task_name}'")
                    # Use task instance as a context manager to ensure
                    # a single database connection is used for the entire task
                    with task_info["instance"]:
                        # Execute the registered task function with its arguments
                        task_info["func"](*task_info["args"], **task_info["kwargs"])
                    self.logger.info(f"Task '{task_name}' completed")
                except Exception as e:
                    self.logger.exception(f"Error running task '{task_name}': {e}")
                finally:
                    # Close the database pool after task execution
                    close_db_pool()

    def start(self):
        """Start the scheduler."""
        if self.running:
            self.logger.warning("Scheduler is already running")
            return

        self.logger.info("Starting scheduler")
        self.running = True
        self.stop_event.clear()

        # Start a thread for each task
        for task_name, task_info in self.tasks.items():
            thread = threading.Thread(
                target=self._run_task,
                args=(task_name, task_info),
                name=f"scheduler-{task_name}",
            )
            thread.daemon = True
            thread.start()
            self.threads.append(thread)

        self.logger.info(f"Started {len(self.threads)} scheduler threads")

    def stop(self):
        """Stop the scheduler."""
        if not self.running:
            return

        self.logger.info("Stopping scheduler")
        self.running = False
        self.stop_event.set()

        # Wait for all threads to terminate
        for thread in self.threads:
            thread.join(timeout=5.0)

        self.threads = []

        # Close database pool when the scheduler stops
        close_db_pool()

        self.logger.info("Scheduler stopped")

    def is_running(self) -> bool:
        """Check if the scheduler is running."""
        return self.running
