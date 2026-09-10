import json
import unittest
from pathlib import Path

from pyworker.utils.description_rules import check_description

FIXTURE = json.loads(
    (Path(__file__).parent / "fixtures/description_rules.json").read_text()
)


class TestDescriptionRules(unittest.TestCase):
    def test_agrees_with_the_shared_fixture(self):
        for case in FIXTURE["cases"]:
            with self.subTest(text=case["text"]):
                self.assertEqual(
                    sorted(check_description(case["text"])), sorted(case["violations"])
                )

    def test_abbreviations_and_versions_are_not_sentence_ends(self):
        self.assertEqual(
            check_description("Runs Bisq 2.1 and later, e.g. on Linux."), []
        )
