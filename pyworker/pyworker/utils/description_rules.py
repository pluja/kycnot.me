"""
The mechanical half of the service description rule.

The rule is one fixture read by this module and by web/src/lib/descriptionRules.ts,
and tests/fixtures/description_rules.json holds the cases both sides must agree
on. The judgement half, such as when "no-KYC exchange" is a fair label, lives in
the scan prompt and with the reviewer.
"""

import json
import re
from pathlib import Path

_RULES = json.loads(
    (
        Path(__file__).resolve().parents[2] / "tests/fixtures/description_rules.json"
    ).read_text()
)

MAX_LENGTH: int = _RULES["maxLength"]
MAX_SENTENCES: int = _RULES["maxSentences"]
_LEADING_WORDS: set[str] = set(_RULES["leadingWords"])


def _phrase_pattern(phrases: list[str]) -> re.Pattern[str]:
    joined = "|".join(re.escape(p) for p in phrases)
    return re.compile(rf"(^|[^a-z])({joined})(?=$|[^a-z])", re.IGNORECASE)


_MARKETING = _phrase_pattern(_RULES["marketingWords"])
_POLICY = _phrase_pattern(_RULES["policyWords"])
_FIRST_PERSON = re.compile(r"(^|[^a-z])(we|our|ours|us)(?=$|[^a-z])", re.IGNORECASE)
_DASH = re.compile(r"[–—]|(^|\s)-{2,}(\s|$)|\s-\s")
# A terminator followed by a space and a capital, or the end. A dot inside
# "e.g." or a version number is not followed by a capital letter.
_SENTENCE_END = re.compile(r"[.!?]+(?:\s+(?=[A-Z0-9\"'(])|$)")


def count_sentences(text: str) -> int:
    return len([s for s in _SENTENCE_END.split(text) if s.strip()])


def _letters(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


def check_description(text: str, name: str = "") -> list[str]:
    """Every rule the text breaks, as the same names the web side reports.

    The name, when given, may not open the text: it is shown right above it.
    """
    trimmed = text.strip()
    if not trimmed:
        return ["empty"]
    violations: list[str] = []
    opening = trimmed.split()[0].lower()
    starts_with_name = bool(name) and _letters(trimmed).startswith(_letters(name))
    if opening in _LEADING_WORDS or starts_with_name:
        violations.append("opening")
    if len(trimmed) > MAX_LENGTH:
        violations.append("length")
    if count_sentences(trimmed) > MAX_SENTENCES:
        violations.append("sentences")
    if _DASH.search(trimmed):
        violations.append("dash")
    if "!" in trimmed:
        violations.append("exclamation")
    if _FIRST_PERSON.search(trimmed):
        violations.append("first-person")
    if _MARKETING.search(trimmed):
        violations.append("marketing")
    if _POLICY.search(trimmed):
        violations.append("policy")
    return violations
