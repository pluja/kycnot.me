"""
Configuration module for pyworker.

Handles loading environment variables and configuration settings.
"""

import os
import re
from typing import Dict

from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


class Config:
    """Configuration class for the worker application."""

    # Database settings
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", "postgresql://kycnot:kycnot@localhost:3399/kycnot"
    )

    # Clean the URL by removing any query parameters
    @property
    def db_connection_string(self) -> str:
        """Get the clean database connection string without query parameters."""
        if "?" in self.DATABASE_URL:
            return self.DATABASE_URL.split("?")[0]
        return self.DATABASE_URL

    # API settings
    TOS_API_BASE_URL: str = os.getenv("TOS_API_BASE_URL", "https://r.jina.ai")

    # Crawl4AI settings
    CRAWL4AI_BASE_URL: str = os.getenv("CRAWL4AI_BASE_URL", "http://crawl4ai:11235")
    CRAWL4AI_API_TOKEN: str = os.getenv("CRAWL4AI_API_TOKEN", "")
    CRAWL4AI_TIMEOUT: int = int(os.getenv("CRAWL4AI_TIMEOUT", "300"))
    CRAWL4AI_POLL_INTERVAL: int = int(os.getenv("CRAWL4AI_POLL_INTERVAL", "2"))

    # Bot user settings
    BOT_USERNAME: str = os.getenv("PYWORKER_BOT_USERNAME", "pyworker-bot")

    # Service scan queue settings
    SERVICE_SCAN_CLAIM_TIMEOUT_MINUTES: int = int(
        os.getenv("SERVICE_SCAN_CLAIM_TIMEOUT_MINUTES", "15")
    )

    # Logging settings
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    LOG_FORMAT: str = os.getenv(
        "LOG_FORMAT", "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )

    # Task scheduling
    @property
    def task_schedules(self) -> Dict[str, str]:
        """
        Get cron schedules for tasks from environment variables.

        Looks for environment variables with the pattern CRON_TASKNAME_TASK
        and returns a dictionary mapping task names to cron schedules.

        Returns:
            Dictionary mapping task names to cron schedules.
        """
        schedules: Dict[str, str] = {}
        cron_pattern = re.compile(r"^CRON_(\w+)_TASK$")

        for key, value in os.environ.items():
            match = cron_pattern.match(key)
            if match:
                task_name = match.group(1).lower()
                schedules[task_name] = value

        return schedules


# Create a singleton instance
config = Config()
