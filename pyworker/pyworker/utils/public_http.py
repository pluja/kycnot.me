"""
Requests to URLs that come from users or crawled pages, kept off private and internal networks.
"""

import ipaddress
import socket
from typing import List, Tuple
from urllib.parse import SplitResult, urlsplit

import requests
import urllib3

# NAT64 prefixes embed an IPv4 address that Python still reports as global, so 64:ff9b::7f00:1 reaches loopback on
# a host behind DNS64.
_NAT64_NETWORKS = (
    ipaddress.ip_network("64:ff9b::/96"),
    ipaddress.ip_network("64:ff9b:1::/48"),
)


class NonPublicUrlError(requests.RequestException):
    """The URL is not http(s), or its host resolves to an address outside the public internet. It is a
    RequestException so callers that already tolerate failed fetches tolerate a refused one the same way."""


def public_addresses(parts: SplitResult) -> List[str]:
    """Every address the host resolves to, refused unless all of them are public: one private answer is enough for a
    later lookup to land on it."""
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise NonPublicUrlError(f"not an http(s) URL: {parts.geturl()}")
    try:
        addresses = [
            str(info[4][0]).split("%")[0]
            for info in socket.getaddrinfo(
                parts.hostname, None, type=socket.SOCK_STREAM
            )
        ]
    except UnicodeError as error:
        raise NonPublicUrlError(f"invalid host name: {error}") from error
    except socket.gaierror as error:
        raise requests.ConnectionError(
            f"cannot resolve {parts.hostname}: {error}"
        ) from error
    if not addresses or not all(_is_public(a) for a in addresses):
        raise NonPublicUrlError(f"{parts.hostname} resolves to a non-public address")
    return addresses


def _is_public(address: str) -> bool:
    ip = ipaddress.ip_address(address)
    return ip.is_global and not any(ip in network for network in _NAT64_NETWORKS)


def require_public_url(url: str) -> None:
    public_addresses(urlsplit(url))


def pinned_get(
    parts: SplitResult,
    address: str,
    *,
    user_agent: str,
    timeout: urllib3.Timeout,
    max_body_bytes: int = 0,
) -> Tuple[int, urllib3.HTTPHeaderDict, bytes]:
    """A GET to parts that connects to address instead of resolving the name again, so the address that was checked
    is the one requested. Sends Host and SNI for the name, follows no redirects, ignores any proxy set in the
    environment and reads at most max_body_bytes of the body."""
    https = parts.scheme == "https"
    port = parts.port or (443 if https else 80)
    host = parts.hostname or ""
    tls = (
        {
            "cert_reqs": "CERT_REQUIRED",
            "ca_certs": requests.certs.where(),
            "server_hostname": host,
            "assert_hostname": host,
        }
        if https
        else {}
    )
    pool_class = urllib3.HTTPSConnectionPool if https else urllib3.HTTPConnectionPool
    with pool_class(address, port, timeout=timeout, retries=False, **tls) as pool:
        response = pool.urlopen(
            "GET",
            (parts.path or "/") + (f"?{parts.query}" if parts.query else ""),
            headers={"Host": parts.netloc.rsplit("@", 1)[-1], "User-Agent": user_agent},
            redirect=False,
            preload_content=False,
        )
        body = response.read(max_body_bytes) if max_body_bytes > 0 else b""
        status, headers = response.status, response.headers
        response.close()
    return status, headers, body
