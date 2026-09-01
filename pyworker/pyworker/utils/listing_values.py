"""
Comparison of a platform record against what a document says.

The two sides speak differently: the platform stores a country as ISO-3166
alpha-2 while a document writes it out, and a company is "Acme Ltd" in one place
and "Acme Limited" in the other. Comparing the raw strings reports a
disagreement on almost every service that has these fields filled in, which
buries the real ones.
"""

import json
import pathlib
import re

_COUNTRIES: "dict[str, list[str]]" = json.loads(
    (pathlib.Path(__file__).parent.parent / "data" / "countries.json").read_text()
)

# Generated from the countries-list package the web app already uses, by
# scripts/sync_country_names.mjs. Regenerate rather than edit by hand.
_NAMES_TO_CODE = {
    name.lower(): code for code, names in _COUNTRIES.items() for name in names
}

_COMPANY_SUFFIXES = (
    "incorporated",
    "corporation",
    "limited",
    "company",
    "holdings",
    "group",
    "ltda",
    "ltd",
    "llc",
    "inc",
    "corp",
    "gmbh",
    "ug",
    "oy",
    "ou",
    "sarl",
    "sas",
    "sa",
    "srl",
    "bv",
    "nv",
    "ab",
    "as",
    "plc",
    "pte",
    "pty",
)

_PUNCTUATION = re.compile(r"[^a-z0-9 ]")
_WHITESPACE = re.compile(r"\s+")


def _squash(value: str) -> str:
    return _WHITESPACE.sub(" ", _PUNCTUATION.sub(" ", (value or "").lower())).strip()


def country_key(value: str) -> str:
    """A country as its ISO-3166 alpha-2 code, whichever way it was written."""
    squashed = _squash(value)
    if len(squashed) == 2 and squashed.upper() in _COUNTRIES:
        return squashed.upper()
    return _NAMES_TO_CODE.get(squashed, squashed)


def company_key(value: str) -> str:
    """A company name without the legal form, which the two sides spell differently."""
    words = _squash(value).split()
    while words and words[-1] in _COMPANY_SUFFIXES:
        words.pop()
    return " ".join(words)


_FIELD_KEYS = {
    "registrationCountryCode": country_key,
    "registeredCompanyName": company_key,
}


def values_disagree(field: str, recorded: str, found: str) -> bool:
    """Whether a document really says something else, rather than saying it differently."""
    found = (found or "").strip()
    if not found:
        return False
    to_key = _FIELD_KEYS.get(field, _squash)
    return to_key(recorded) != to_key(found)


def storable_value(field: str, found: str) -> "str | None":
    """The value as the record holds it, or None when it cannot be held at all.

    A country is written down as a two-letter code, so a proposal reading
    "British Virgin Islands" out of a document has to arrive as VG or it cannot
    be applied: the column is two characters wide. Normalising here rather than
    at the point of writing means a reviewer is never shown a proposal they
    cannot accept.
    """
    found = (found or "").strip()
    if not found:
        return None
    if field != "registrationCountryCode":
        return found
    code = country_key(found)
    return code if code in _COUNTRIES else None
