import pytest

from pyworker.utils.ai import _strip_thinking


def test_strip_thinking_think_tags():
    content = '<think>This is reasoning</think>\n{"key": "value"}'
    assert _strip_thinking(content) == '{"key": "value"}'


def test_strip_thinking_thinking_tags():
    content = (
        '<thinking>Long reasoning\nover multiple lines</thinking>\n{"key": "value"}'
    )
    assert _strip_thinking(content) == '{"key": "value"}'


def test_strip_thinking_no_tags():
    content = '{"key": "value"}'
    assert _strip_thinking(content) == '{"key": "value"}'


def test_strip_thinking_multiline():
    content = '<think>\nStep 1\nStep 2\n</think>\n\n{"result": true}'
    assert _strip_thinking(content) == '{"result": true}'


def _make_loader(prompts_dir):
    """Return a _load_prompt-equivalent that reads from a temp directory."""

    def load(filename: str, **static_vars: str) -> str:
        text = (prompts_dir / filename).read_text()
        for key, value in static_vars.items():
            placeholder = f"{{{{{key}}}}}"
            if placeholder not in text:
                raise ValueError(
                    f"Prompt '{filename}' is missing placeholder {placeholder}"
                )
            text = text.replace(placeholder, value)
        return text

    return load


def test_load_prompt_substitution(tmp_path):
    prompts_dir = tmp_path / "prompts"
    prompts_dir.mkdir()
    (prompts_dir / "test.md").write_text("Schema: {{schema}}.")
    load = _make_loader(prompts_dir)
    result = load("test.md", schema="TYPE")
    assert result == "Schema: TYPE."


def test_load_prompt_missing_placeholder_raises(tmp_path):
    prompts_dir = tmp_path / "prompts"
    prompts_dir.mkdir()
    (prompts_dir / "test.md").write_text("No placeholder here.")
    load = _make_loader(prompts_dir)
    with pytest.raises(ValueError, match="missing placeholder"):
        load("test.md", schema="TYPE")


def test_load_prompt_schema_substituted():
    """Schema placeholder should not remain in loaded prompts."""
    from pyworker.utils.ai import _PROMPT_COMMENT_MODERATION
    from pyworker.utils.ai import PROMPT_CHECK_TOS_REVIEW

    for prompt in (
        _PROMPT_COMMENT_MODERATION,
        PROMPT_CHECK_TOS_REVIEW,
    ):
        assert "{{schema}}" not in prompt


def _completion(content):
    from types import SimpleNamespace

    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=content))]
    )


def test_a_reply_that_fails_validation_is_asked_for_again(monkeypatch):
    from unittest.mock import MagicMock

    from pyworker.utils import ai

    def validate(result):
        if result["rating"] not in ("negative", "neutral", "positive"):
            raise ValueError("bad rating")

    create = MagicMock(
        side_effect=[
            _completion('{"rating": "warning"}'),
            _completion('{"rating": "neutral"}'),
        ]
    )
    monkeypatch.setattr(ai.client.chat.completions, "create", create)
    monkeypatch.setattr(ai.time, "sleep", lambda seconds: None)

    result = ai.query_openai_json([], model="m", validate=validate)

    assert result == {"rating": "neutral"}
    assert create.call_count == 2


def test_a_reply_that_never_validates_raises(monkeypatch):
    from unittest.mock import MagicMock

    from pyworker.utils import ai

    def validate(result):
        raise ValueError("bad rating")

    create = MagicMock(return_value=_completion('{"rating": "warning"}'))
    monkeypatch.setattr(ai.client.chat.completions, "create", create)
    monkeypatch.setattr(ai.time, "sleep", lambda seconds: None)

    with pytest.raises(ValueError, match="bad rating"):
        ai.query_openai_json([], model="m", validate=validate)
