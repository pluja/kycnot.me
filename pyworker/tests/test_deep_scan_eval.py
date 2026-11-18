from pyworker.evals.deep_scan_eval import looks_like_sentence, same_clause, score_call

CLAUSE = "We reserve the right to suspend or terminate any account at any time under our own discretion."


def proposal(*highlights, kyc_level=1):
    return {
        "tosReview": {"kycLevel": kyc_level, "highlights": list(highlights)},
        "attributes": {"add": [], "remove": []},
        "ungroundedHighlights": 0,
        "rawListingChecks": [],
    }


def highlight(evidence, rating):
    return {"title": "t", "evidence": evidence, "rating": rating}


def test_the_same_clause_quoted_with_other_boundaries_matches():
    assert same_clause(
        "NiceVPS reserves the right to suspend or terminate any account at any time under our own discretion.",
        CLAUSE,
    )


def test_different_clauses_do_not_match():
    assert not same_clause(
        "Refunds are only possible within the first 24 hours.", CLAUSE
    )


def test_a_rating_is_right_when_it_is_one_of_the_accepted_answers():
    gold = {
        "highlights": [
            {"evidence": CLAUSE, "rating": ["negative", "neutral"], "core": True}
        ]
    }
    row = score_call(proposal(highlight(CLAUSE, "neutral")), gold)
    assert (row["ratingsChecked"], row["ratingsRight"], row["coreFound"]) == (1, 1, 1)


def test_a_wrong_rating_is_reported():
    gold = {"highlights": [{"evidence": CLAUSE, "rating": "negative", "core": False}]}
    row = score_call(proposal(highlight(CLAUSE, "positive")), gold)
    assert row["ratingsRight"] == 0
    assert row["ratingMisses"] == ["t: positive (want negative)"]


def test_a_clause_that_should_not_be_a_highlight_counts_as_noise_not_a_rating():
    gold = {"highlights": [{"evidence": CLAUSE, "rating": "skip", "core": False}]}
    row = score_call(proposal(highlight(CLAUSE, "neutral")), gold)
    assert (row["noise"], row["ratingsChecked"], row["scored"]) == (1, 0, 1)


def test_a_highlight_missing_from_the_answers_is_unscored():
    row = score_call(proposal(highlight(CLAUSE, "negative")), {"highlights": []})
    assert row["scored"] == 0
    assert row["unscored"] == ["[negative] t"]


def test_kyc_is_right_when_the_level_is_accepted():
    assert score_call(proposal(kyc_level=2), {"kycLevel": [2, 3]})["kycRight"]
    assert not score_call(proposal(kyc_level=1), {"kycLevel": [2, 3]})["kycRight"]


def test_a_sentence_is_not_a_field_value():
    assert looks_like_sentence(
        "The Privacy Policy names a company. The KYC page names another."
    )
    assert not looks_like_sentence("3-102-939930 S.R.L.")
