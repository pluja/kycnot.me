import http.server
import socket
import threading
import time
from unittest.mock import MagicMock, patch
from urllib.parse import urlsplit

import urllib3

from pyworker.tasks import suggestion_cleanup as cleanup


def test_host_of_keeps_web_hosts_only():
    assert cleanup.host_of("https://www.Example.com/path") == "example.com"
    assert cleanup.host_of("example.com") == "example.com"
    assert cleanup.host_of("http://abc.onion") is None
    assert cleanup.host_of("http://abc.i2p") is None
    assert cleanup.host_of("ftp://example.com") is None


def _resolves_to(address):
    return patch.object(
        cleanup.socket,
        "getaddrinfo",
        return_value=[(None, None, None, "", (address, 0))],
    )


def test_site_is_down_reads_failures_and_bot_walls():
    with _resolves_to("93.184.216.34"):
        with patch.object(
            cleanup,
            "fetch_status",
            side_effect=urllib3.exceptions.NewConnectionError(None, "refused"),
        ):
            assert cleanup.site_is_down("https://gone.test") is True
        with patch.object(
            cleanup,
            "fetch_status",
            side_effect=urllib3.exceptions.ReadTimeoutError(None, None, "slow"),
        ):
            assert cleanup.site_is_down("https://slow.test") is True
        for status, down in (
            (200, False),
            (403, False),
            (429, False),
            (404, True),
            (410, True),
            (503, True),
        ):
            with patch.object(cleanup, "fetch_status", return_value=(status, None)):
                assert cleanup.site_is_down("https://site.test") is down, status


def test_only_a_name_that_no_longer_exists_is_down():
    gone = socket.gaierror(socket.EAI_NONAME, "unknown name")
    with patch.object(cleanup.socket, "getaddrinfo", side_effect=gone):
        assert cleanup.site_is_down("https://expired.test") is True
    resolver_down = socket.gaierror(socket.EAI_AGAIN, "temporary failure")
    with patch.object(cleanup.socket, "getaddrinfo", side_effect=resolver_down):
        assert cleanup.site_is_down("https://fine.test") is None


def test_private_addresses_are_never_requested():
    for address in ("127.0.0.1", "10.0.0.5", "169.254.169.254", "100.64.0.1", "::1"):
        with _resolves_to(address), patch.object(cleanup, "fetch_status") as fetch:
            assert cleanup.site_is_down("http://internal.test") is None, address
            fetch.assert_not_called()


def test_redirects_are_checked_hop_by_hop():
    addresses = iter(["93.184.216.34", "10.0.0.5"])
    with (
        patch.object(
            cleanup.socket,
            "getaddrinfo",
            side_effect=lambda *args, **kwargs: [
                (None, None, None, "", (next(addresses), 0))
            ],
        ),
        patch.object(
            cleanup, "fetch_status", return_value=(301, "http://internal.test/admin")
        ) as fetch,
    ):
        assert cleanup.site_is_down("https://public.test") is None
    assert fetch.call_count == 1
    with (
        _resolves_to("93.184.216.34"),
        patch.object(cleanup, "fetch_status", return_value=(302, "/again")),
    ):
        assert cleanup.site_is_down("https://loop.test") is None


def test_a_malformed_redirect_says_nothing_instead_of_failing_the_run():
    with (
        _resolves_to("93.184.216.34"),
        patch.object(cleanup, "fetch_status", return_value=(302, "http://[")),
    ):
        assert cleanup.site_is_down("https://odd.test") is None


def test_a_check_past_its_deadline_says_nothing():
    with (
        _resolves_to("93.184.216.34"),
        patch.object(cleanup, "CHECK_DEADLINE_SECONDS", 0.1),
        patch.object(
            cleanup,
            "fetch_status",
            side_effect=lambda *args: time.sleep(1) or (200, None),
        ),
    ):
        assert cleanup.site_is_down("https://drip.test") is None


def test_the_request_goes_to_the_checked_address_with_the_site_name():
    seen = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            seen["host"], seen["path"] = self.headers["Host"], self.path
            self.send_response(204)
            self.end_headers()

        def log_message(self, *args):
            pass

    server = http.server.HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.handle_request, daemon=True).start()
    port = server.server_address[1]
    status, _ = cleanup.fetch_status(
        urlsplit(f"http://site.test:{port}/a?b=1"), "127.0.0.1"
    )
    server.server_close()
    assert status == 204
    assert seen == {"host": f"site.test:{port}", "path": "/a?b=1"}


def _task(queries, dry_run=False):
    task = cleanup.SuggestionCleanupTask(dry_run=dry_run)
    task.logger = MagicMock()
    return task, patch.object(cleanup, "run_db_query", side_effect=queries)


def test_a_suggestion_with_the_domain_of_a_listed_service_closes_as_a_duplicate():
    listed = [
        {"id": 1, "name": "Real", "slug": "real", "serviceUrls": ["https://real.com"]}
    ]
    pending = [
        {"id": 10, "serviceId": 2, "serviceUrls": ["https://www.real.com/"]},
        {"id": 11, "serviceId": 3, "serviceUrls": ["https://other.com"]},
        {"id": 12, "serviceId": 1, "serviceUrls": ["https://real.com"]},
    ]
    task, queries = _task([listed, pending])
    with queries:
        closures = task._same_domain()
    assert [closure[0] for closure in closures] == [10]
    assert "kycnot.me/service/real" in closures[0][2]


def test_pages_on_shared_platforms_only_match_the_same_page():
    listed = [
        {
            "id": 1,
            "name": "Bot A",
            "slug": "bot-a",
            "serviceUrls": ["https://t.me/bot_a", "https://github.com/org-a"],
        }
    ]
    pending = [
        {"id": 10, "serviceId": 2, "serviceUrls": ["https://t.me/bot_b"]},
        {"id": 11, "serviceId": 3, "serviceUrls": ["https://github.com/org-b/"]},
        {"id": 12, "serviceId": 4, "serviceUrls": ["https://t.me/Bot_A/"]},
    ]
    task, queries = _task([listed, pending])
    with queries:
        assert [closure[0] for closure in task._same_domain()] == [12]


def test_a_similar_name_alone_never_closes_a_suggestion():
    listed = [
        {
            "id": 1,
            "name": "Swapper",
            "slug": "swapper",
            "serviceUrls": ["https://swapper.io"],
        }
    ]
    pending = [
        {"id": 10, "serviceId": 2, "serviceUrls": ["https://swapper-exchange.com"]}
    ]
    task, queries = _task([listed, pending])
    with queries:
        assert task._same_domain() == []


def test_a_run_records_nothing_when_listed_services_fail_too():
    task, queries = _task(
        [[{"serviceUrls": [f"https://listed{i}.test"]} for i in range(5)]]
    )
    with (
        queries,
        patch.object(cleanup, "site_is_down", return_value=True),
        patch.object(cleanup, "get_db_connection") as connection,
    ):
        summary = task._check_sites()
    assert summary == {"checked": 0, "down": 0, "recorded": 0}
    connection.assert_not_called()


def test_a_site_with_one_working_address_is_up_and_hidden_sites_are_skipped():
    services = [
        {
            "id": 1,
            "serviceUrls": ["https://down.test", "https://up.test"],
            "reachabilityCheckedAt": None,
        },
        {"id": 2, "serviceUrls": ["http://only.onion"], "reachabilityCheckedAt": None},
    ]
    task, queries = _task([services], dry_run=True)
    with (
        queries,
        patch.object(task, "_network_is_up", return_value=True),
        patch.object(
            cleanup, "site_is_down", side_effect=lambda url: url == "https://down.test"
        ),
    ):
        summary = task._check_sites()
    assert summary == {"checked": 1, "down": 0, "recorded": 0}


def test_a_dry_run_closes_nothing():
    task, queries = _task([[{"id": 7}], [], [], [], [], [], []], dry_run=True)
    with (
        queries,
        patch.object(task, "_close") as close,
        patch.object(task, "_dead_sites", return_value=[(5, "dead site", "m")]),
        patch.object(task, "_check_sites", return_value={}),
    ):
        results = task.run()
    close.assert_not_called()
    assert results["by_reason"] == {"dead site": 1}
