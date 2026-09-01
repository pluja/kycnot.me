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
    from pyworker.utils.ai import _PROMPT_TOS_REVIEW, _PROMPT_COMMENT_MODERATION
    from pyworker.utils.ai import (
        PROMPT_COMMENT_SENTIMENT_SUMMARY,
        PROMPT_CHECK_TOS_REVIEW,
    )

    for prompt in (
        _PROMPT_TOS_REVIEW,
        _PROMPT_COMMENT_MODERATION,
        PROMPT_COMMENT_SENTIMENT_SUMMARY,
        PROMPT_CHECK_TOS_REVIEW,
    ):
        assert "{{schema}}" not in prompt
