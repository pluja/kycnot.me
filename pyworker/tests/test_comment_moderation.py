from pyworker.tasks.comment_moderation import _decide, _decide_edit, _edit_context


def _ctx(
    *,
    untrusted=False,
    private_proof=False,
    changes_verdict=False,
    checked_proof=False,
    issues=(),
    accepted_proof=False,
    strict=False,
):
    return {
        "comment": {
            "submission": {
                "hasPrivateProof": private_proof,
                "changesVerdict": changes_verdict,
                "experienceHasCheckedProof": checked_proof,
                "issues": list(issues),
                "hasAcceptedProof": accepted_proof,
            },
            "author": {
                "trust": {"isUntrusted": untrusted},
            },
        },
        "service": {"strictCommentingEnabled": strict},
    }


def _ai(*, action="approve", spam=False, brigade=False, bconf=0, quality=5, rule=None):
    return {
        "recommendedAction": action,
        "isSpam": spam,
        "isBrigade": brigade,
        "brigadeConfidence": bconf,
        "commentQuality": quality,
        "rejectionRule": rule,
        "reasoning": "r",
    }


# --- rejections record the rule they broke ---


def test_reject_records_the_model_rule():
    ai = {**_ai(action="reject", rule="SCAM_CONTACT"), "rejectionConfident": True}
    d = _decide(ai, _ctx())
    assert d["status"] == "REJECTED"
    assert d["rejection_rule"] == "SCAM_CONTACT"


def test_spam_reject_without_rule_defaults_to_spam():
    d = _decide({**_ai(action="reject", spam=True), "rejectionConfident": True}, _ctx())
    assert d["rejection_rule"] == "SPAM"


def test_a_strike_the_ai_is_unsure_of_or_cannot_judge_goes_to_a_human():
    for rule, confident in (
        ("HARASSMENT", True),
        ("NOT_GENUINE", True),
        ("SPAM", False),
        ("SLUR", False),
    ):
        ai = {**_ai(action="reject", rule=rule), "rejectionConfident": confident}
        d = _decide(ai, _ctx())
        assert (d["status"], d["ai_action"], d["rejection_rule"]) == (
            "PENDING",
            "HOLD",
            None,
        ), rule
        assert (
            d["ai_signals"]["hardGateReason"]
            == f"possible {rule.lower().replace('_', ' ')}"
        )


def test_rules_that_are_no_strike_can_be_rejected_by_the_ai():
    ai = {**_ai(action="reject", rule="OFF_TOPIC"), "rejectionConfident": False}
    assert _decide(ai, _ctx())["status"] == "REJECTED"


def test_reject_without_rule_defaults_to_other():
    assert _decide(_ai(action="reject"), _ctx())["rejection_rule"] == "OTHER"


def test_non_rejection_records_no_rule():
    assert _decide(_ai(action="approve", rule="SPAM"), _ctx())["rejection_rule"] is None
    assert _decide(_ai(action="human_review"), _ctx())["rejection_rule"] is None


def test_approve_without_gates_publishes():
    d = _decide(_ai(action="approve"), _ctx())
    assert d["status"] == "APPROVED"
    assert d["hard_gate_reason"] == ""


def test_proof_alone_does_not_block_publication():
    assert (
        _decide(_ai(), _ctx(private_proof=True, issues=["OTHER"]))["status"]
        == "APPROVED"
    )


def test_claim_of_harm_waits_for_its_proof_check():
    for claim in ("KYC_REQUESTED", "FUNDS_BLOCKED"):
        held = _decide(_ai(), _ctx(private_proof=True, issues=[claim]))
        assert held["status"] == "PENDING"
        assert held["hard_gate_reason"] == "claim awaiting a proof check"
        checked = _decide(
            _ai(), _ctx(private_proof=True, issues=[claim], accepted_proof=True)
        )
        assert checked["status"] == "APPROVED"


def test_inconsistent_spam_approval_waits_for_human():
    assert _decide(_ai(action="approve", spam=True), _ctx())["status"] == "PENDING"


# --- proof never holds a post; strict services always wait for a human ---


def test_proof_waiting_for_a_check_does_not_hold():
    d = _decide(_ai(action="approve"), _ctx(private_proof=True))
    assert d["status"] == "APPROVED"


def test_update_that_changes_a_verdict_waits_for_a_human_with_or_without_proof():
    d = _decide(
        _ai(action="approve"),
        _ctx(changes_verdict=True, checked_proof=False),
    )
    assert d["status"] == "PENDING"
    assert "update changes the experience verdict" in d["hard_gate_reason"]


def test_a_post_with_no_gate_is_not_held():
    d = _decide(_ai(action="approve"), _ctx())
    assert d["status"] == "APPROVED"


def test_strict_service_holds_every_post():
    d = _decide(_ai(action="approve"), _ctx(strict=True))
    assert d["status"] == "PENDING"


def test_proof_still_lets_obvious_trash_be_rejected():
    d = _decide(
        {**_ai(action="reject", spam=True), "rejectionConfident": True},
        _ctx(private_proof=True),
    )
    assert d["status"] == "REJECTED"


def test_untrusted_author_waits_for_human():
    d = _decide(_ai(action="approve"), _ctx(untrusted=True))
    assert d["status"] == "PENDING"
    assert "recent penalized rejections" in d["hard_gate_reason"]


def test_untrusted_author_can_still_be_rejected():
    assert _decide(_ai(action="reject"), _ctx(untrusted=True))["status"] == "REJECTED"


def test_verdict_change_waits_with_or_without_proof():
    unchecked = _decide(_ai(action="approve"), _ctx(changes_verdict=True))
    assert unchecked["status"] == "PENDING"
    checked = _decide(
        _ai(action="approve"), _ctx(changes_verdict=True, checked_proof=True)
    )
    assert checked["status"] == "PENDING"
    assert "verdict" in checked["hard_gate_reason"]


def _revision(
    *,
    changes_verdict=False,
    checked_proof=False,
    changes_kind=False,
    held=False,
    reported=False,
    content="Edited text",
    published="Edited text",
    edited_issues=(),
    published_issues=(),
):
    return {
        "editedIssues": list(edited_issues),
        "publishedIssues": list(published_issues),
        "content": content,
        "publishedContent": published,
        "kind": "EXPERIENCE",
        "changesVerdict": changes_verdict,
        "experienceHasCheckedProof": checked_proof,
        "changesKind": changes_kind,
        "heldByModerator": held,
        "hasOpenReport": reported,
    }


def test_edit_context_swaps_in_the_edited_text():
    context = _edit_context(_ctx(), _revision())
    assert context["comment"]["content"] == "Edited text"
    assert context["comment"]["submission"]["isEditOfPublishedPost"] is True


def test_clean_edit_is_approved():
    d = _decide_edit(_ai(action="approve"), _edit_context(_ctx(), _revision()))
    assert d["action"] == "APPROVE"


def test_confident_clear_cut_edit_is_rejected():
    ai = {**_ai(action="reject", spam=True, rule="SPAM"), "rejectionConfident": True}
    d = _decide_edit(ai, _edit_context(_ctx(), _revision()))
    assert d["action"] == "REJECT"
    assert d["rejection_rule"] == "SPAM"


def test_judgement_calls_and_low_confidence_go_to_a_human():
    context = _edit_context(_ctx(), _revision())
    harassment = {**_ai(action="reject", rule="HARASSMENT"), "rejectionConfident": True}
    assert _decide_edit(harassment, context)["action"] == "HOLD"
    unsure = {**_ai(action="reject", rule="SLUR"), "rejectionConfident": False}
    assert _decide_edit(unsure, context)["action"] == "HOLD"
    assert _decide_edit(_ai(action="human_review"), context)["action"] == "HOLD"


def test_verdict_change_goes_to_a_human_with_or_without_proof():
    for checked_proof in (False, True):
        context = _edit_context(
            _ctx(), _revision(changes_verdict=True, checked_proof=checked_proof)
        )
        assert _decide_edit(_ai(action="approve"), context)["action"] == "HOLD"


def test_edit_waits_when_a_moderator_is_involved_or_the_type_changes():
    for revision in (
        _revision(reported=True),
        _revision(held=True),
        _revision(changes_kind=True),
    ):
        context = _edit_context(_ctx(), revision)
        assert _decide_edit(_ai(action="approve"), context)["action"] == "HOLD"


def test_disabled_author_cannot_publish():
    context = _ctx()
    context["comment"]["author"]["trust"]["postingDisabled"] = True
    assert _decide(_ai(action="approve"), context)["status"] == "PENDING"


def test_rewrite_of_a_checked_experience_waits_but_small_edits_publish():
    published = (
        "The exchange took two hours and sent the full amount without asking for ID."
    )
    small = published.replace("two hours", "three hours")
    rewritten = (
        "They froze my funds for a month and demanded a passport scan before paying."
    )
    for content, action in ((small, "APPROVE"), (rewritten, "HOLD")):
        revision = _revision(checked_proof=True, content=content, published=published)
        assert (
            _decide_edit(_ai(action="approve"), _edit_context(_ctx(), revision))[
                "action"
            ]
            == action
        )
    unchecked = _revision(content=rewritten, published=published)
    assert (
        _decide_edit(_ai(action="approve"), _edit_context(_ctx(), unchecked))["action"]
        == "APPROVE"
    )


def test_worker_moderates_edits_on_a_service_with_no_pending_posts(monkeypatch):
    from pyworker.tasks import comment_moderation as task_module

    revision = {"id": 7, "commentId": 3, **_revision(content="Edited text")}
    contexts, decisions = [], []
    monkeypatch.setattr(task_module, "get_pending_comments", lambda service_id: [])
    monkeypatch.setattr(
        task_module, "get_pending_revisions", lambda service_id: [revision]
    )

    def fake_context(comment_id, content=None):
        contexts.append((comment_id, content))
        return _ctx()

    monkeypatch.setattr(task_module, "get_moderation_context", fake_context)
    monkeypatch.setattr(task_module, "prompt_comment_moderation", lambda payload: _ai())

    def fake_apply(**kwargs):
        decisions.append(kwargs)
        return kwargs["ai_action"]

    monkeypatch.setattr(task_module, "apply_ai_edit_decision", fake_apply)

    assert task_module.CommentModerationTask().run({"id": 1, "name": "Service"}) is True
    assert contexts == [(3, "Edited text")]
    assert decisions[0]["revision_id"] == 7
    assert decisions[0]["ai_action"] == "APPROVE"


def test_edit_that_adds_a_claim_of_harm_waits_for_proof():
    adds = _edit_context(_ctx(), _revision(edited_issues=["FUNDS_BLOCKED"]))
    assert _decide_edit(_ai(action="approve"), adds)["action"] == "HOLD"
    keeps = _edit_context(
        _ctx(),
        _revision(edited_issues=["FUNDS_BLOCKED"], published_issues=["FUNDS_BLOCKED"]),
    )
    assert _decide_edit(_ai(action="approve"), keeps)["action"] == "APPROVE"


def test_risk_signals_hold_posts_in_either_direction():
    for signal, reason in (
        ("proofIdReused", "order ID used on another post"),
        ("proofIdOffFormat", "order ID does not match the service format"),
        ("newAccountWave", "wave of new-account posts"),
    ):
        context = _ctx()
        context["comment"]["submission"][signal] = True
        held = _decide(_ai(), context)
        assert held["status"] == "PENDING"
        assert held["hard_gate_reason"] == reason
    generated = _decide({**_ai(), "looksGenerated": True}, _ctx())
    assert generated["hard_gate_reason"] == "text looks generated or templated"


def test_edits_ignore_signals_about_the_original_post():
    context = _ctx()
    context["comment"]["submission"].update(proofIdReused=True, newAccountWave=True)
    assert (
        _decide_edit(_ai(action="approve"), _edit_context(context, _revision()))[
            "action"
        ]
        == "APPROVE"
    )


def test_not_enough_detail_with_proof_or_a_claim_goes_to_a_human():
    ai = {**_ai(action="reject"), "rejectionRule": "NOT_ENOUGH_DETAIL"}
    assert _decide(ai, _ctx())["status"] == "REJECTED"
    assert _decide(ai, _ctx(private_proof=True))["status"] == "PENDING"
    assert _decide(ai, _ctx(issues=["FUNDS_BLOCKED"]))["status"] == "PENDING"
