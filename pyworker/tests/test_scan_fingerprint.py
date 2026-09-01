"""
Tests for pyworker.utils.scan_fingerprint
"""

import json
import pathlib
import unittest

from pyworker.utils.scan_fingerprint import scan_fingerprint

FIXTURE = pathlib.Path(__file__).parent / "fixtures" / "scan_fingerprints.json"


def _digest(row: dict) -> str:
    return scan_fingerprint(row["serviceId"], row["kind"], row["key"])


class TestScanFingerprint(unittest.TestCase):
    """One identity per proposal, so a reviewer is asked at most once."""

    def setUp(self):
        self.rows = json.loads(FIXTURE.read_text())

    def test_service_kind_and_key_each_change_identity(self):
        base = _digest(self.rows[0])

        for row in self.rows[1:4]:
            self.assertNotEqual(_digest(row), base, msg=f"{row['kind']} {row['key']}")

    def test_surrounding_whitespace_does_not_change_identity(self):
        self.assertEqual(_digest(self.rows[4]), _digest(self.rows[0]))

    def test_digest_is_hex_sha256(self):
        digest = _digest(self.rows[0])

        self.assertEqual(len(digest), 64)
        self.assertTrue(all(c in "0123456789abcdef" for c in digest))

    def test_matches_the_shared_fixture(self):
        # The same table the TypeScript side runs, so the two cannot drift
        # without a test failing on one of them.
        for row in self.rows:
            self.assertEqual(_digest(row), row["expected"], msg=row["kind"])


if __name__ == "__main__":
    unittest.main()
