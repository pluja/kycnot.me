from unittest.mock import MagicMock, patch

import pytest

from pyworker.tasks.experience_classification import classify_experiences


@pytest.fixture(autouse=True)
def classification_model(monkeypatch):
    monkeypatch.setenv("CLASSIFICATION_MODEL", "configured-model")


def setup_connection(updated=True):
    connection = MagicMock()
    cursor = connection.cursor.return_value.__enter__.return_value
    cursor.fetchall.return_value = [
        {"id": 42, "version": 3, "content": "My swap was delayed."}
    ]
    cursor.fetchone.return_value = (42,) if updated else None
    manager = MagicMock()
    manager.__enter__.return_value = connection
    return manager, connection, cursor


def test_classification_sends_only_public_text_and_preserves_moderation():
    manager, connection, cursor = setup_connection()
    with (
        patch(
            "pyworker.tasks.experience_classification.get_db_connection",
            return_value=manager,
        ),
        patch(
            "pyworker.tasks.experience_classification.query_openai_json",
            return_value={"kind": "EXPERIENCE", "sentiment": "NEGATIVE"},
        ) as prompt,
    ):
        assert classify_experiences(limit=1, after_id=41) == 0
    assert (
        prompt.call_args.args[0][1]["content"] == '{"content": "My swap was delayed."}'
    )
    statements = [call.args[0] for call in cursor.execute.call_args_list]
    assert not any(
        '"Notification"' in statement or "SET status" in statement
        for statement in statements
    )
    assert connection.commit.call_count == 2


@pytest.mark.parametrize(
    "sentiment, expected_params",
    [("NEGATIVE", (42, "NEGATIVE", "NEGATIVE")), (None, (42, None, None))],
)
def test_sentiment_source_is_only_set_when_sentiment_is_written(
    sentiment, expected_params
):
    manager, _, cursor = setup_connection()
    with (
        patch(
            "pyworker.tasks.experience_classification.get_db_connection",
            return_value=manager,
        ),
        patch(
            "pyworker.tasks.experience_classification.query_openai_json",
            return_value={"kind": "EXPERIENCE", "sentiment": sentiment},
        ),
    ):
        classify_experiences(limit=1)
    insert_call = next(
        call for call in cursor.execute.call_args_list if "INSERT INTO" in call.args[0]
    )
    assert "CASE WHEN %s::text IS NULL THEN NULL ELSE 'AI'" in insert_call.args[0]
    assert insert_call.args[1] == expected_params


def test_stale_classification_does_not_insert_experience_data():
    manager, _, cursor = setup_connection(updated=False)
    with (
        patch(
            "pyworker.tasks.experience_classification.get_db_connection",
            return_value=manager,
        ),
        patch(
            "pyworker.tasks.experience_classification.query_openai_json",
            return_value={"kind": "EXPERIENCE", "sentiment": "NEGATIVE"},
        ),
    ):
        classify_experiences(limit=1)
    assert not any(
        "INSERT INTO" in call.args[0] for call in cursor.execute.call_args_list
    )


def test_invalid_ai_label_stops_without_writing():
    manager, connection, cursor = setup_connection()
    with (
        patch(
            "pyworker.tasks.experience_classification.get_db_connection",
            return_value=manager,
        ),
        patch(
            "pyworker.tasks.experience_classification.query_openai_json",
            return_value={"kind": "EXPERIENCE", "sentiment": "TRUSTWORTHY"},
        ),
        pytest.raises(ValueError),
    ):
        classify_experiences(limit=1)
    assert not any(
        "SET kind=%s" in call.args[0] for call in cursor.execute.call_args_list
    )
    assert connection.commit.call_count == 1


def test_classification_uses_the_configured_model_and_never_leaves_posts_unclassified():
    manager, connection, cursor = setup_connection()
    with (
        patch(
            "pyworker.tasks.experience_classification.get_db_connection",
            return_value=manager,
        ),
        patch(
            "pyworker.tasks.experience_classification.query_openai_json",
            return_value={"kind": "UNCLASSIFIED", "sentiment": None},
        ) as prompt,
        pytest.raises(ValueError),
    ):
        classify_experiences(limit=1)
    assert prompt.call_args.kwargs["model"] == "configured-model"
    assert not any(
        "SET kind=%s" in call.args[0] for call in cursor.execute.call_args_list
    )


def test_rejected_posts_become_discussion_without_an_ai_call():
    manager, _, cursor = setup_connection()
    cursor.fetchall.return_value = []
    with (
        patch(
            "pyworker.tasks.experience_classification.get_db_connection",
            return_value=manager,
        ),
        patch("pyworker.tasks.experience_classification.query_openai_json") as prompt,
    ):
        classify_experiences(limit=1)
    prompt.assert_not_called()
    bulk = cursor.execute.call_args_list[0].args[0]
    assert "SET kind='DISCUSSION'" in bulk and "status='REJECTED'" in bulk
