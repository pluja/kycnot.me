import http.server
import socket
import threading
from unittest.mock import patch
from urllib.parse import urlsplit

import pytest
import requests

from pyworker.utils import app_http, crawl, public_http


def _resolves_to(*addresses):
    return patch.object(
        public_http.socket,
        "getaddrinfo",
        return_value=[(None, None, None, "", (address, 0)) for address in addresses],
    )


def test_only_hosts_that_resolve_to_public_addresses_pass():
    with _resolves_to("93.184.216.34"):
        assert public_http.public_addresses(urlsplit("https://site.test/x")) == [
            "93.184.216.34"
        ]
    for addresses in (
        ("127.0.0.1",),
        ("10.0.0.5",),
        ("169.254.169.254",),
        ("::1",),
        ("fd00::1",),
        ("93.184.216.34", "192.168.1.1"),
        ("64:ff9b::7f00:1",),
        ("64:ff9b::a9fe:a9fe",),
    ):
        with _resolves_to(*addresses), pytest.raises(public_http.NonPublicUrlError):
            public_http.require_public_url("https://site.test/")


def test_non_web_urls_and_unknown_hosts_are_refused():
    for url in ("file:///etc/passwd", "gopher://site.test", "https://", "site.test"):
        with pytest.raises(public_http.NonPublicUrlError):
            public_http.require_public_url(url)
    unknown = socket.gaierror(socket.EAI_NONAME, "unknown name")
    with (
        patch.object(public_http.socket, "getaddrinfo", side_effect=unknown),
        pytest.raises(requests.ConnectionError),
    ):
        public_http.require_public_url("https://gone.test/")


def test_a_host_name_the_resolver_cannot_encode_is_refused():
    with pytest.raises(public_http.NonPublicUrlError):
        public_http.require_public_url(f"https://{'a' * 64}.test/")


def test_fetch_url_moves_on_when_the_first_address_is_unreachable():
    import urllib3

    attempts = []

    def pinned_page(parts, address, timeout):
        attempts.append(address)
        if address == "2001:db8::1":
            raise urllib3.exceptions.NewConnectionError(None, "no route")
        return 200, urllib3.HTTPHeaderDict({"Content-Type": "text/plain"}), b"ok"

    with (
        patch.object(
            app_http, "public_addresses", return_value=["2001:db8::1", "93.184.216.34"]
        ),
        patch.object(app_http, "_pinned_page", side_effect=pinned_page),
    ):
        assert app_http.fetch_url("https://site.test/") == "ok"
    assert attempts == ["2001:db8::1", "93.184.216.34"]


def _serve(handler_body):
    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            handler_body(self)

        def log_message(self, *args):
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def _local_site(port):
    """site.test reaches the local server; internal.test stands in for a host on a private network."""

    def public_addresses(parts):
        if parts.hostname == "site.test":
            return ["127.0.0.1"]
        raise public_http.NonPublicUrlError(f"{parts.hostname} is private")

    return patch.object(app_http, "public_addresses", side_effect=public_addresses)


def test_fetch_url_reads_the_page_in_its_charset():
    def respond(handler):
        body = "café".encode("latin-1")
        handler.send_response(200)
        handler.send_header("Content-Type", "text/html; charset=iso-8859-1")
        handler.send_header("Content-Length", str(len(body)))
        handler.end_headers()
        handler.wfile.write(body)

    server = _serve(respond)
    port = server.server_address[1]
    with _local_site(port):
        assert app_http.fetch_url(f"http://site.test:{port}/") == "café"
    server.shutdown()


def test_fetch_url_refuses_a_redirect_into_a_private_network():
    def respond(handler):
        handler.send_response(302)
        handler.send_header("Location", "http://internal.test/admin")
        handler.end_headers()

    server = _serve(respond)
    port = server.server_address[1]
    with _local_site(port):
        assert app_http.fetch_url(f"http://site.test:{port}/") is None
    server.shutdown()


def test_fetch_url_stops_after_too_many_redirects_and_on_errors():
    def respond(handler):
        if handler.path == "/missing":
            handler.send_response(404)
            handler.end_headers()
            return
        handler.send_response(302)
        handler.send_header("Location", "/again")
        handler.end_headers()

    server = _serve(respond)
    port = server.server_address[1]
    with _local_site(port):
        assert app_http.fetch_url(f"http://site.test:{port}/loop") is None
        assert app_http.fetch_url(f"http://site.test:{port}/missing") is None
    server.shutdown()


def test_fetch_url_reads_no_more_than_the_body_limit():
    def respond(handler):
        handler.send_response(200)
        handler.send_header("Content-Type", "text/plain; charset=utf-8")
        handler.end_headers()
        handler.wfile.write(b"a" * 4096)

    server = _serve(respond)
    port = server.server_address[1]
    with _local_site(port), patch.object(app_http, "MAX_BODY_BYTES", 100):
        assert app_http.fetch_url(f"http://site.test:{port}/") == "a" * 100
    server.shutdown()


@pytest.mark.real_url_guard
def test_no_private_url_reaches_the_crawler_or_its_fallback():
    with (
        _resolves_to("10.0.0.5"),
        patch.object(crawl.requests, "post") as crawler,
        patch.object(crawl.requests, "get") as fallback,
    ):
        with pytest.raises(public_http.NonPublicUrlError):
            crawl._post_crawl(["https://site.test/", "https://internal.test/"])
        assert crawl.fetch_markdown("https://internal.test/") == ""
    crawler.assert_not_called()
    fallback.assert_not_called()
