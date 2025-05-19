"""
Base task module for the pyworker package.
"""

from abc import ABC, abstractmethod
from contextlib import AbstractContextManager
from typing import Any, Optional, Type

from pyworker.database import get_db_connection
from pyworker.utils.app_logging import setup_logging

logger = setup_logging(__name__)


class Task(ABC):
    """Base class for all worker tasks."""

    def __init__(self, name: str):
        """
        Initialize a task.

        Args:
            name: The name of the task.
        """
        self.name = name
        self.logger = setup_logging(f"pyworker.task.{name}")
        self.conn: Optional[Any] = None
        self._context: Optional[AbstractContextManager[Any]] = None

    def __enter__(self):
        """Enter context manager, acquiring a database connection."""
        self._context = get_db_connection()
        self.conn = self._context.__enter__()
        return self

    def __exit__(
        self,
        exc_type: Optional[Type[BaseException]],
        exc_val: Optional[BaseException],
        exc_tb: Optional[Any],
    ) -> Optional[bool]:
        """Exit context manager, releasing the database connection."""
        if self._context:
            return self._context.__exit__(exc_type, exc_val, exc_tb)
        return None

    @abstractmethod
    def run(self, *args: Any, **kwargs: Any) -> Any:
        """
        Run the task.

        This method must be implemented by subclasses.

        Args:
            *args: Variable length argument list.
            **kwargs: Arbitrary keyword arguments.

        Returns:
            The result of the task.
        """
        pass

    def __str__(self) -> str:
        return f"{self.__class__.__name__}(name={self.name})"
