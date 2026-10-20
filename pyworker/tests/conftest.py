import pytest


def pytest_configure(config):
    config.addinivalue_line(
        "markers", "real_url_guard: run the crawler's public-address check for real"
    )


@pytest.fixture(autouse=True)
def _crawl_hosts_need_no_dns(request, monkeypatch):
    # Crawl tests use made-up hosts and a mocked crawler, so resolving them would make the suite depend on DNS.
    if request.node.get_closest_marker("real_url_guard"):
        return
    monkeypatch.setattr("pyworker.utils.crawl.require_public_url", lambda url: None)
