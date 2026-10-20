"""
HTTP utilities for the pyworker package.
"""

import codecs
import logging
from email.message import Message
from typing import Optional, Tuple
from urllib.parse import SplitResult, urljoin, urlsplit

import requests
import urllib3

from pyworker.utils.public_http import pinned_get, public_addresses

logger = logging.getLogger(__name__)

MAX_REDIRECTS = 5
MAX_BODY_BYTES = 5 * 1024 * 1024


def _charset(content_type: str) -> str:
    message = Message()
    message["Content-Type"] = content_type
    charset = message.get_content_charset() or "utf-8"
    try:
        codecs.lookup(charset)
    except LookupError:
        return "utf-8"
    return charset


def _get_from_any_address(
    parts: SplitResult, timeout: int
) -> Tuple[int, urllib3.HTTPHeaderDict, bytes]:
    """Tries each checked address in turn, as a resolver-driven client would, so a host whose first answer is
    unreachable from here (IPv6 on an IPv4-only container) still loads."""
    addresses = public_addresses(parts)
    for address in addresses[:-1]:
        try:
            return _pinned_page(parts, address, timeout)
        except urllib3.exceptions.NewConnectionError:
            continue
    return _pinned_page(parts, addresses[-1], timeout)


def _pinned_page(
    parts: SplitResult, address: str, timeout: int
) -> Tuple[int, urllib3.HTTPHeaderDict, bytes]:
    return pinned_get(
        parts,
        address,
        user_agent=requests.utils.default_user_agent(),
        timeout=urllib3.Timeout(connect=10, read=timeout),
        max_body_bytes=MAX_BODY_BYTES,
    )


def fetch_url(url: str, timeout: int = 30) -> Optional[str]:
    """
    Fetch content from a URL. Redirects are followed by hand and every hop must resolve to a public address, since
    the URLs come from users and from crawled pages.

    Returns:
        The text content of the response, or None if the request failed or was refused.
    """
    current = url
    try:
        for _ in range(MAX_REDIRECTS + 1):
            parts = urlsplit(current)
            status, headers, body = _get_from_any_address(parts, timeout)
            location = headers.get("Location")
            if 300 <= status < 400 and location:
                current = urljoin(current, location)
                continue
            if status >= 400:
                raise requests.HTTPError(f"{status} for {current}")
            return body.decode(
                _charset(headers.get("Content-Type", "")), errors="replace"
            )
        raise requests.TooManyRedirects(f"more than {MAX_REDIRECTS} redirects")
    except (requests.RequestException, urllib3.exceptions.HTTPError, ValueError) as e:
        logger.error(f"Error fetching URL {url}: {e}")
        return None
