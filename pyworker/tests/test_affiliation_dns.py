from datetime import datetime
from unittest.mock import MagicMock, patch

from pyworker.tasks import affiliation_dns as task_module


def test_claimed_usernames_reads_lists_and_ignores_other_records():
    assert task_module.claimed_usernames(
        ["kycnotme-verify=Alice, bob", "KYCNOTME-VERIFY=carol dave", "v=spf1 -all"]
    ) == {"alice", "bob", "carol", "dave"}


def test_host_still_listed_matches_the_host_or_its_www():
    urls = ["https://www.example.com/", "https://t.me/example"]
    assert task_module.host_still_listed("example.com", urls)
    assert task_module.host_still_listed("www.example.com", urls)
    assert not task_module.host_still_listed("other.com", urls)


def test_host_still_listed_reads_hosts_like_the_claim_page():
    assert task_module.host_still_listed(
        "xn--bcher-kva.example", ["https://bücher.example/"]
    )
    assert task_module.host_still_listed("example.com", ["https://example.com./"])
    assert not task_module.host_still_listed(
        "example.com", ["https://example.com/about"]
    )
    assert not task_module.host_still_listed("example.com", ["ftp://example.com/"])


def test_changed_hands_needs_a_later_registration_beyond_a_day():
    claimed = datetime(2020, 1, 1)
    assert task_module.changed_hands(claimed, datetime(2026, 1, 1))
    assert not task_module.changed_hands(claimed, datetime(2020, 1, 1, 12))
    assert not task_module.changed_hands(None, datetime(2026, 1, 1))
    assert not task_module.changed_hands(claimed, None)


def _row(failed=0, registered=None):
    return {
        "id": 1,
        "userId": 7,
        "serviceId": 3,
        "dnsHost": "example.com",
        "dnsFailedChecks": failed,
        "domainRegisteredAt": registered,
        "username": "alice",
        "service_name": "Example",
        "serviceUrls": ["https://example.com/"],
    }


def _run(row, records, registered_now=None):
    task = task_module.AffiliationDnsTask()
    task.logger = MagicMock()
    task.rdap = MagicMock()
    task.rdap.registered_at.return_value = registered_now
    connection = MagicMock()
    cursor = (
        connection.__enter__.return_value.cursor.return_value.__enter__.return_value
    )
    with (
        patch.object(task_module, "lookup_txt", return_value=records),
        patch.object(task_module, "get_db_connection", return_value=connection),
    ):
        outcome = task._check(row)
    statements = [call.args[0] for call in cursor.execute.call_args_list]
    return outcome, statements


def test_a_present_record_resets_the_misses():
    outcome, statements = _run(_row(failed=2), ["kycnotme-verify=bob,alice"])
    assert outcome == "confirmed"
    assert '"dnsFailedChecks" = 0' in statements[0]


def test_a_missing_record_counts_a_miss_and_tells_the_user():
    outcome, statements = _run(_row(failed=0), [])
    assert outcome == "missed"
    assert any("SERVICE_AFFILIATION_CHECK_FAILED" in s for s in statements)
    assert not any("DELETE" in s for s in statements)


def test_the_third_miss_removes_the_affiliation():
    outcome, statements = _run(_row(failed=2), ["kycnotme-verify=someoneelse"])
    assert outcome == "revoked"
    assert any(s.startswith('DELETE FROM "ServiceUser"') for s in statements)
    assert any("SERVICE_AFFILIATION_REVOKED" in s for s in statements)
    assert any('INSERT INTO "AuditLog"' in s for s in statements)


def test_a_domain_registered_again_is_revoked_even_with_the_record():
    outcome, _ = _run(
        _row(registered=datetime(2020, 1, 1)),
        ["kycnotme-verify=alice"],
        registered_now=datetime(2026, 3, 1),
    )
    assert outcome == "revoked"


def test_a_resolver_failure_says_nothing():
    outcome, statements = _run(_row(failed=2), None)
    assert outcome == "skipped"
    assert statements == []
