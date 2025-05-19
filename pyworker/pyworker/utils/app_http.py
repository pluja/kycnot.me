"""
HTTP utilities for the pyworker package.
"""

from typing import Optional

import requests

from pyworker.utils.app_logging import setup_logging

logger = setup_logging(__name__)


def fetch_url(url: str, timeout: int = 30) -> Optional[str]:
    """
    Fetch content from a URL.

    Args:
        url: The URL to fetch.
        timeout: The timeout in seconds.

    Returns:
        The text content of the response, or None if the request failed.
    """
    try:
        response = requests.get(url, timeout=timeout)
        response.raise_for_status()
        return response.text
    except requests.RequestException as e:
        logger.error(f"Error fetching URL {url}: {e}")
        return None
