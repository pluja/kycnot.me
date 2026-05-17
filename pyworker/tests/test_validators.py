import pytest

from pyworker.utils import schemas


# --- TOS_CHECK ---

def test_tos_check_valid():
    schemas.TOS_CHECK.validate({"isComplete": True})
    schemas.TOS_CHECK.validate({"isComplete": False})


def test_tos_check_missing_field():
    with pytest.raises(ValueError, match="isComplete"):
        schemas.TOS_CHECK.validate({})


def test_tos_check_wrong_type():
    with pytest.raises(ValueError, match="bool"):
        schemas.TOS_CHECK.validate({"isComplete": "yes"})


# --- TOS_REVIEW ---

VALID_TOS_REVIEW = {
    "kycLevel": 2,
    "summary": "Short summary",
    "complexity": "medium",
    "highlights": [
        {"title": "Data sharing", "content": "They share data", "rating": "negative"}
    ],
}


def test_tos_review_valid():
    schemas.TOS_REVIEW.validate(VALID_TOS_REVIEW)


def test_tos_review_missing_field():
    data = {**VALID_TOS_REVIEW}
    del data["kycLevel"]
    with pytest.raises(ValueError, match="kycLevel"):
        schemas.TOS_REVIEW.validate(data)


def test_tos_review_kyc_out_of_range():
    with pytest.raises(ValueError, match="kycLevel"):
        schemas.TOS_REVIEW.validate({**VALID_TOS_REVIEW, "kycLevel": 5})


def test_tos_review_kyc_wrong_type():
    with pytest.raises(ValueError, match="kycLevel"):
        schemas.TOS_REVIEW.validate({**VALID_TOS_REVIEW, "kycLevel": "high"})


def test_tos_review_complexity_invalid():
    with pytest.raises(ValueError, match="complexity"):
        schemas.TOS_REVIEW.validate({**VALID_TOS_REVIEW, "complexity": "extreme"})


def test_tos_review_highlights_bad_rating():
    bad = {**VALID_TOS_REVIEW, "highlights": [{"title": "x", "content": "y", "rating": "bad"}]}
    with pytest.raises(ValueError, match="rating"):
        schemas.TOS_REVIEW.validate(bad)


def test_tos_review_highlights_missing_field():
    bad = {**VALID_TOS_REVIEW, "highlights": [{"title": "x", "content": "y"}]}
    with pytest.raises(ValueError, match="rating"):
        schemas.TOS_REVIEW.validate(bad)


# --- COMMENT_MOD ---

VALID_COMMENT_MOD = {
    "recommendedAction": "approve",
    "reasoning": "Detailed first-hand review from established account.",
    "commentQuality": 7,
    "isSpam": False,
    "isBrigade": False,
    "brigadeConfidence": 0,
    "ratingShouldBeDisabled": False,
    "contextNote": "",
}


def test_comment_mod_valid():
    schemas.COMMENT_MOD.validate(VALID_COMMENT_MOD)


def test_comment_mod_missing_field():
    data = {**VALID_COMMENT_MOD}
    del data["isSpam"]
    with pytest.raises(ValueError, match="isSpam"):
        schemas.COMMENT_MOD.validate(data)


def test_comment_mod_quality_out_of_range():
    with pytest.raises(ValueError, match="commentQuality"):
        schemas.COMMENT_MOD.validate({**VALID_COMMENT_MOD, "commentQuality": 11})


def test_comment_mod_quality_wrong_type():
    with pytest.raises(ValueError, match="commentQuality"):
        schemas.COMMENT_MOD.validate({**VALID_COMMENT_MOD, "commentQuality": "high"})


def test_comment_mod_bool_wrong_type():
    with pytest.raises(ValueError, match="bool"):
        schemas.COMMENT_MOD.validate({**VALID_COMMENT_MOD, "isSpam": 1})


def test_comment_mod_invalid_recommended_action():
    with pytest.raises(ValueError, match="recommendedAction"):
        schemas.COMMENT_MOD.validate({**VALID_COMMENT_MOD, "recommendedAction": "maybe"})


def test_comment_mod_brigade_confidence_out_of_range():
    with pytest.raises(ValueError, match="brigadeConfidence"):
        schemas.COMMENT_MOD.validate({**VALID_COMMENT_MOD, "brigadeConfidence": 6})


def test_comment_mod_spam_with_approve_rejected():
    with pytest.raises(ValueError, match="isSpam"):
        schemas.COMMENT_MOD.validate({
            **VALID_COMMENT_MOD,
            "isSpam": True,
            "recommendedAction": "approve",
        })


def test_comment_mod_brigade_without_confidence_rejected():
    with pytest.raises(ValueError, match="brigadeConfidence"):
        schemas.COMMENT_MOD.validate({
            **VALID_COMMENT_MOD,
            "isBrigade": True,
            "brigadeConfidence": 0,
        })


# --- COMMENT_SEN ---

VALID_COMMENT_SEN = {
    "summary": "Users mostly happy",
    "sentiment": "positive",
    "whatUsersLike": ["fast", "cheap"],
    "whatUsersDislike": ["UI"],
}


def test_comment_sen_valid():
    schemas.COMMENT_SEN.validate(VALID_COMMENT_SEN)


def test_comment_sen_missing_field():
    data = {**VALID_COMMENT_SEN}
    del data["sentiment"]
    with pytest.raises(ValueError, match="sentiment"):
        schemas.COMMENT_SEN.validate(data)


def test_comment_sen_invalid_sentiment():
    with pytest.raises(ValueError, match="sentiment"):
        schemas.COMMENT_SEN.validate({**VALID_COMMENT_SEN, "sentiment": "mixed"})


def test_comment_sen_likes_wrong_type():
    with pytest.raises(ValueError, match="whatUsersLike"):
        schemas.COMMENT_SEN.validate({**VALID_COMMENT_SEN, "whatUsersLike": "fast"})
