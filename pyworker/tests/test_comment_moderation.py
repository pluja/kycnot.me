from pyworker.tasks.comment_moderation import _decide, _pick_mute_reason


def _ctx(*, affiliated=False, karma=10, is_root=True, rating=5,
         private_proof=False, kyc=False, funds=False, strict=False):
    return {
        "comment": {
            "submission": {
                "isRootReview": is_root,
                "rating": rating,
                "hasPrivateProof": private_proof,
                "kycIssueClaimed": kyc,
                "fundsBlockedClaimed": funds,
            },
            "author": {"isServiceAffiliated": affiliated, "totalKarma": karma},
        },
        "service": {"strictCommentingEnabled": strict},
    }


def _ai(*, action="approve", spam=False, brigade=False, bconf=0,
        quality=5, disable=False):
    return {
        "recommendedAction": action,
        "isSpam": spam,
        "isBrigade": brigade,
        "brigadeConfidence": bconf,
        "commentQuality": quality,
        "ratingShouldBeDisabled": disable,
        "reasoning": "r",
        "contextNote": "",
    }


# --- subjective rating-disable: no auto-mute, escalate instead ---

def test_subjective_disable_does_not_mute_and_escalates():
    d = _decide(_ai(action="approve", disable=True), _ctx(karma=5))
    assert d["rating_muted"] is False
    assert d["rating_mute_reason"] is None
    assert d["status"] == "PENDING"
    assert d["ai_action"] == "HOLD"
    assert "rating integrity" in d["hard_gate_reason"]


def test_subjective_disable_does_not_escalate_a_reject():
    d = _decide(_ai(action="reject", disable=True), _ctx(karma=5))
    assert d["rating_muted"] is False
    assert d["status"] == "REJECTED"


def test_no_disable_keeps_rating_active_and_approves():
    d = _decide(_ai(action="approve", disable=False), _ctx(karma=5))
    assert d["rating_muted"] is False
    assert d["rating_mute_reason"] is None
    assert d["status"] == "APPROVED"
    assert d["hard_gate_reason"] == ""


# --- concrete bases still auto-mute (and do not over-escalate) ---

def test_affiliated_positive_auto_mutes_without_escalation():
    d = _decide(_ai(action="approve", disable=True), _ctx(affiliated=True, rating=5))
    assert d["rating_mute_reason"] == "AUTHOR_AFFILIATED"
    assert d["rating_muted"] is True
    assert d["status"] == "APPROVED"


def test_negative_karma_auto_mutes():
    d = _decide(_ai(action="approve", disable=True), _ctx(karma=-3))
    assert d["rating_mute_reason"] == "AUTHOR_LOW_TRUST"
    assert d["rating_muted"] is True
    assert d["status"] == "APPROVED"


def test_moderate_brigade_auto_mutes_suspicious():
    d = _decide(_ai(action="approve", disable=True, bconf=2), _ctx(karma=5))
    assert d["rating_mute_reason"] == "SUSPICIOUS_PATTERN"
    assert d["rating_muted"] is True
    assert d["status"] == "APPROVED"


def test_high_conf_brigade_mutes_and_holds():
    d = _decide(
        _ai(action="human_review", brigade=True, bconf=5, disable=True),
        _ctx(karma=5),
    )
    assert d["rating_mute_reason"] == "SUSPICIOUS_PATTERN"
    assert d["rating_muted"] is True
    assert d["status"] == "PENDING"


def test_spam_auto_mutes_template():
    d = _decide(_ai(action="reject", spam=True), _ctx(karma=5))
    assert d["rating_mute_reason"] == "TEMPLATE_SPAM"
    assert d["rating_muted"] is True
    assert d["status"] == "REJECTED"


# --- a comment held for a hard topic is not also rating-muted by the AI ---

def test_hard_topic_hold_keeps_rating_active_when_ai_did_not_flag():
    d = _decide(_ai(action="approve", disable=False), _ctx(karma=5, funds=True))
    assert d["status"] == "PENDING"
    assert d["rating_muted"] is False
    assert d["rating_mute_reason"] is None


# --- the COI fallback is retired: no concrete signal never returns a reason ---

def test_pick_mute_reason_subjective_returns_none():
    assert _pick_mute_reason(_ai(disable=True), _ctx(karma=5), False) is None


def test_pick_mute_reason_never_returns_conflict_of_interest():
    # Exhaust the author-signal combinations; none should yield the old COI code.
    for karma in (-5, 0, 5):
        for affiliated in (False, True):
            for bconf in (0, 1, 2, 4):
                reason = _pick_mute_reason(
                    _ai(disable=True, bconf=bconf),
                    _ctx(affiliated=affiliated, karma=karma),
                    bconf >= 4,
                )
                assert reason != "CONFLICT_OF_INTEREST"
