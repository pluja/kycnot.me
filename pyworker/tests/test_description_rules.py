import json
import unittest
from pathlib import Path

from pyworker.utils.description_rules import check_description

RULE_FILE = Path(__file__).resolve().parents[1] / "pyworker/description_rules.json"
FIXTURE = json.loads(RULE_FILE.read_text())


class TestDescriptionRules(unittest.TestCase):
    def test_agrees_with_the_shared_fixture(self):
        for case in FIXTURE["cases"]:
            with self.subTest(text=case["text"]):
                self.assertEqual(
                    sorted(check_description(case["text"])), sorted(case["violations"])
                )

    def test_the_service_name_may_not_open_the_description(self):
        for case in FIXTURE["nameCases"]:
            with self.subTest(text=case["text"]):
                self.assertEqual(
                    sorted(check_description(case["text"], case["name"])),
                    sorted(case["violations"]),
                )

    def test_the_web_app_ships_the_same_rule_file(self):
        web_copy = RULE_FILE.parents[2] / "web/src/constants/descriptionRules.json"
        if not web_copy.exists():
            self.skipTest("web checkout not present")
        self.assertEqual(web_copy.read_text(), RULE_FILE.read_text())

    def test_abbreviations_and_versions_are_not_sentence_ends(self):
        self.assertEqual(
            check_description("Runs Bisq 2.1 and later, e.g. on Linux."), []
        )
