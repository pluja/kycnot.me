import os
import re
import time
from datetime import date
from pathlib import Path
from typing import Any, Dict, List, Literal, TypedDict, cast

_PROMPTS_DIR = Path(__file__).parent.parent / "prompts"

from json_repair import repair_json
from openai import OpenAI, OpenAIError
from openai.types.chat import ChatCompletionMessageParam

from pyworker.database import (
    CommentModerationType,
    CommentSentimentSummaryType,
    TosReviewType,
)
from pyworker.utils import schemas
from pyworker.utils.app_logging import setup_logging

logger = setup_logging(__name__)


def _load_prompt(name: str, **static_vars: str) -> str:
    text = (_PROMPTS_DIR / name).read_text()
    for key, value in static_vars.items():
        placeholder = f"{{{{{key}}}}}"
        if placeholder not in text:
            raise ValueError(f"Prompt '{name}' is missing placeholder {placeholder}")
        text = text.replace(placeholder, value)
    return text


def _strip_thinking(content: str) -> str:
    """Strip reasoning model thinking blocks before JSON parsing."""
    content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL)
    content = re.sub(r"<thinking>.*?</thinking>", "", content, flags=re.DOTALL)
    return content.strip()


def _today() -> str:
    return f"Today's date: {date.today().isoformat()}\n\n"

PROMPT_CHECK_TOS_REVIEW = _load_prompt("tos_check.md", schema=schemas.TOS_CHECK.ts_type)
_PROMPT_TOS_REVIEW = _load_prompt("tos_review.md", schema=schemas.TOS_REVIEW.ts_type)
PROMPT_COMMENT_SENTIMENT_SUMMARY = _load_prompt("comment_sentiment.md", schema=schemas.COMMENT_SEN.ts_type)
_PROMPT_COMMENT_MODERATION = _load_prompt("comment_moderation.md", schema=schemas.COMMENT_MOD.ts_type)


client = OpenAI(
    base_url=os.environ.get("OPENAI_BASE_URL"),
    api_key=os.environ.get("OPENAI_API_KEY"),
)


def query_openai_json(
    messages: List[ChatCompletionMessageParam],
    model: str = os.environ.get("OPENAI_MODEL", "deepseek-chat-cheaper"),
) -> Dict[str, Any]:
    max_retries = int(os.environ.get("OPENAI_RETRY", 3))
    retry_delay = 30
    last_error = None

    for attempt in range(max_retries):
        try:
            completion = client.chat.completions.create(
                model=model,
                messages=messages,
            )
            content = completion.choices[0].message.content
            if content is None:
                raise ValueError("OpenAI response content is None")

            logger.debug(f"Raw AI response content: {content}")

            content = _strip_thinking(content)

            try:
                result = repair_json(content)

                if isinstance(result, str):
                    import json

                    result = json.loads(result)

                if not isinstance(result, dict):
                    logger.error(
                        f"Repaired JSON is not a dictionary. Type: {type(result)}, Value: {result}"
                    )
                    raise TypeError(
                        f"Expected a dictionary from AI response, but got {type(result)}"
                    )

                return result
            except Exception as e:
                logger.error(f"Failed to process JSON response: {e}")
                logger.error(f"Raw content was: {content}")
                raise

        except (OpenAIError, ValueError, TypeError) as e:
            last_error = e
            if attempt == max_retries - 1:  # Last attempt
                logger.error(f"Failed after {max_retries} attempts. Last error: {e}")
                raise last_error
            logger.warning(
                f"Attempt {attempt + 1} failed: {e}. Retrying in {retry_delay} seconds..."
            )
            time.sleep(retry_delay)
            retry_delay *= 2  # Exponential backoff

    # This line should never be reached due to the raise in the last attempt
    raise last_error  # type: ignore


ReasonType = Literal["js_required", "firewalled", "other"]


class TosReviewCheck(TypedDict):
    isComplete: bool


def prompt_check_tos_review(content: str) -> TosReviewCheck:
    messages: List[ChatCompletionMessageParam] = [
        {"role": "system", "content": PROMPT_CHECK_TOS_REVIEW},
        {"role": "user", "content": content},
    ]

    result_dict = query_openai_json(
        messages,
        model=os.environ.get("OPENAI_MODEL_FAST", "openai/gemini-2.5-flash-preview-05-20"),
    )

    schemas.TOS_CHECK.validate(result_dict)
    return cast(TosReviewCheck, result_dict)


def prompt_tos_review(content: str) -> TosReviewType:
    messages: List[ChatCompletionMessageParam] = [
        {"role": "system", "content": _today() + _PROMPT_TOS_REVIEW},
        {"role": "user", "content": content},
    ]

    result_dict = query_openai_json(messages)

    schemas.TOS_REVIEW.validate(result_dict)
    return cast(TosReviewType, result_dict)


def prompt_comment_sentiment_summary(content: str) -> CommentSentimentSummaryType:
    messages: List[ChatCompletionMessageParam] = [
        {"role": "system", "content": PROMPT_COMMENT_SENTIMENT_SUMMARY},
        {"role": "user", "content": content},
    ]

    result_dict = query_openai_json(messages)
    schemas.COMMENT_SEN.validate(result_dict)
    return cast(CommentSentimentSummaryType, result_dict)


def prompt_comment_moderation(content: str) -> CommentModerationType:
    messages: List[ChatCompletionMessageParam] = [
        {"role": "system", "content": _today() + _PROMPT_COMMENT_MODERATION},
        {"role": "user", "content": content},
    ]

    result_dict = query_openai_json(messages)

    schemas.COMMENT_MOD.validate(result_dict)
    return cast(CommentModerationType, result_dict)
