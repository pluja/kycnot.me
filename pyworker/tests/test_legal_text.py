"""
Tests for pyworker.utils.legal_text
"""

import unittest

from pyworker.utils.legal_text import (
    MATERIAL_WORD_THRESHOLD,
    LegalChangeLevel,
    LegalDocumentKind,
    classify_legal_document_kind,
    combined_corpus_hash,
    diff_legal_text,
    is_usable_legal_page,
    legal_content_hash,
    normalize_legal_markdown,
)


class TestNormalizeLegalMarkdown(unittest.TestCase):
    """Normalization decides what counts as a change, so it is tested directly."""

    def test_drops_publication_metadata_lines(self):
        for line in (
            "Last updated: 3 March 2026",
            "**Last Modified** June 1, 2026",
            "Effective as of 2026-01-01",
            "© 2026 Example Ltd",
        ):
            self.assertEqual(
                normalize_legal_markdown(f"{line}\nWe require KYC."), "We require KYC."
            )

    def test_normalizes_a_version_number_without_dropping_its_sentence(self):
        self.assertEqual(
            normalize_legal_markdown("Version 4 of these terms applies."),
            "Version <n> of these terms applies.",
        )
        self.assertEqual(
            legal_content_hash("Version 4 of these terms applies."),
            legal_content_hash("Version 5 of these terms applies."),
        )

    def test_keeps_a_clause_that_merely_starts_with_metadata(self):
        # A prefix match would drop the clause with the label, hiding a real
        # change from both the log and the hash that triggers a re-review.
        for line in (
            "**Effective from 1 January 2026:** All withdrawals require photo ID.",
            "We may update these terms. Version 2 adds KYC.",
            "Copyright assignment: you grant us a licence to your content.",
            "Effective from the date we notify you, KYC becomes mandatory.",
        ):
            self.assertIn("BODY", normalize_legal_markdown(f"{line}\nBODY"))
            self.assertNotEqual(normalize_legal_markdown(f"{line}\nBODY"), "BODY")

    def test_copyright_year_churn_does_not_move_the_hash(self):
        self.assertEqual(
            legal_content_hash("© 2026 Example Ltd\nWe may block funds."),
            legal_content_hash("© 2027 Example Ltd\nWe may block funds."),
        )

    def test_keeps_dates_inside_clauses_as_a_placeholder(self):
        normalized = normalize_legal_markdown(
            "Accounts opened before 1 January 2026 are exempt."
        )
        self.assertEqual(normalized, "Accounts opened before <date> are exempt.")

    def test_collapses_whitespace_and_blank_lines(self):
        self.assertEqual(
            normalize_legal_markdown("We   may\n\n\n  block   funds.\n"),
            "We may\nblock funds.",
        )

    def test_strips_tracking_parameters_from_links(self):
        self.assertEqual(
            normalize_legal_markdown("See [policy](https://x.com/p?utm_source=a#top)."),
            "See [policy](https://x.com/p).",
        )

    def test_normalizes_unicode_and_zero_width_characters(self):
        self.assertEqual(normalize_legal_markdown("We​ may ｋyc"), "We may kyc")


class TestLegalContentHash(unittest.TestCase):
    """The hash must be stable across cosmetic republishes."""

    def test_cosmetic_republish_keeps_the_same_hash(self):
        before = (
            "Last updated: 1 May 2026\n\nWe may request identification.\n© 2026 Example"
        )
        after = "Last updated: 9 June 2026\nWe   may request identification.\n© 2026 Example Ltd"
        self.assertEqual(legal_content_hash(before), legal_content_hash(after))

    def test_a_real_clause_change_moves_the_hash(self):
        before = "We never request identification."
        after = "We may request identification."
        self.assertNotEqual(legal_content_hash(before), legal_content_hash(after))

    def test_re_wrapping_keeps_the_same_hash(self):
        self.assertEqual(
            legal_content_hash("We may block funds at any time."),
            legal_content_hash("We may block\nfunds at any time."),
        )

    def test_corpus_hash_is_independent_of_crawl_order(self):
        self.assertEqual(
            combined_corpus_hash(["a", "b", "c"]), combined_corpus_hash(["c", "a", "b"])
        )


class TestDiffLegalText(unittest.TestCase):
    """Change level drives whether a human is told, so each level is pinned."""

    def test_cosmetic_republish_is_not_a_change(self):
        diff = diff_legal_text(
            "Last updated: 1 May 2026\nWe may block funds.",
            "Last updated: 2 June 2026\nWe  may block funds.",
        )
        self.assertEqual(diff.level, LegalChangeLevel.NONE)
        self.assertEqual(diff.changed_words, 0)

    def test_re_wrapping_a_paragraph_is_not_a_change(self):
        diff = diff_legal_text(
            "We may block funds at any time.", "We may block\nfunds at any time."
        )
        self.assertEqual(diff.level, LegalChangeLevel.NONE)

    def test_small_rewording_is_minor(self):
        diff = diff_legal_text("We may block funds.", "We can block funds.")
        self.assertEqual(diff.level, LegalChangeLevel.MINOR)

    def test_a_new_kyc_clause_is_material(self):
        diff = diff_legal_text(
            "We do not collect personal data.",
            "We require government issued identification before any withdrawal is processed.",
        )
        self.assertEqual(diff.level, LegalChangeLevel.MATERIAL)
        self.assertGreaterEqual(diff.changed_words, MATERIAL_WORD_THRESHOLD)

    def test_hunks_are_bounded(self):
        diff = diff_legal_text("old clause\n" * 5000, "new clause\n" * 5000)
        self.assertLessEqual(len(diff.hunks), 12_000)


if __name__ == "__main__":
    unittest.main()


class TestClassifyLegalDocumentKind(unittest.TestCase):
    """URL shapes taken from the live service catalogue."""

    def test_specific_kinds_win_over_the_generic_legal_path(self):
        self.assertEqual(
            classify_legal_document_kind("https://x.com/legal/privacy-policy"),
            LegalDocumentKind.PRIVACY,
        )
        self.assertEqual(
            classify_legal_document_kind("https://x.com/legal/kyc-and-aml"),
            LegalDocumentKind.AML,
        )

    def test_recognises_abbreviated_and_german_forms(self):
        for url, kind in (
            ("https://druck.proxysto.re/site/agb", LegalDocumentKind.TERMS),
            ("https://docs.dfx.swiss/en/tnc.html", LegalDocumentKind.TERMS),
            ("https://moneromarket.io/policies", LegalDocumentKind.TERMS),
            ("https://tuta.com/imprint", LegalDocumentKind.TERMS),
            (
                "https://shopinbit.com/Information/Right-of-Withdrawal",
                LegalDocumentKind.REFUND,
            ),
        ):
            self.assertEqual(classify_legal_document_kind(url), kind, url)

    def test_pages_that_are_not_legal_documents_stay_other(self):
        for url in (
            "https://haveno.exchange/faq",
            "https://airvpn.org/aboutus",
            "https://lnp2pbot.com",
        ):
            self.assertEqual(
                classify_legal_document_kind(url), LegalDocumentKind.OTHER, url
            )


class TestIsUsableLegalPage(unittest.TestCase):
    """A blocked fetch must not become the baseline the next crawl diffs against."""

    def test_rejects_a_challenge_interstitial(self):
        for body in (
            "Just a moment... please wait while we check your browser. " * 20,
            "Checking your browser before accessing the site. " * 20,
            "Attention Required! Please verify you are human. " * 20,
            "Please enable JavaScript and cookies to continue. " * 20,
        ):
            self.assertFalse(is_usable_legal_page(body), body[:40])

    def test_rejects_a_page_too_short_to_be_a_document(self):
        self.assertFalse(is_usable_legal_page("We require KYC."))

    def test_accepts_a_real_document(self):
        self.assertTrue(is_usable_legal_page("We require identity verification before withdrawal. " * 20))
