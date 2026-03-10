"""
Logging configuration for the pyworker package.

Call ``configure_logging()`` once from the CLI entry point.
All other modules should simply use ``logging.getLogger(__name__)``.
"""

import logging
import sys

from pyworker.config import config


def configure_logging() -> None:
    """Configure the root ``pyworker`` logger once.

    Child loggers (``pyworker.database``, ``pyworker.task.comment_moderation``,
    etc.) inherit this configuration via propagation — no per-module setup needed.
    """
    log_level = getattr(logging, config.LOG_LEVEL.upper(), logging.INFO)

    root = logging.getLogger("pyworker")
    root.setLevel(log_level)

    if not root.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(log_level)
        handler.setFormatter(logging.Formatter(config.LOG_FORMAT))
        root.addHandler(handler)
