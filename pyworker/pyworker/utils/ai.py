import logging
import os
import re
import time
from datetime import date
from pathlib import Path
from typing import Any, Dict, List, Literal, TypedDict, cast

from json_repair import repair_json
from openai import OpenAI, OpenAIError
from openai.types.chat import ChatCompletionMessageParam

from pyworker.database import (
    CommentModerationType,
    CommentSentimentSummaryType,
    DeepScanResultType,
)
from pyworker.utils import schemas

_PROMPTS_DIR = Path(__file__).parent.parent / "prompts"

logger = logging.getLogger(__name__)


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


# Shared by both legal-review prompts so the nightly review and the deep scan
# cannot drift into judging the same corpus by different rules.
_LEGAL_REVIEW_FIELDS = (_PROMPTS_DIR / "_legal_review_fields.md").read_text()

PROMPT_CHECK_TOS_REVIEW = _load_prompt("tos_check.md", schema=schemas.TOS_CHECK.ts_type)
_PROMPT_LEGAL_CHANGE_SUMMARY = _load_prompt(
    "legal_change_summary.md", schema=schemas.LEGAL_CHANGE_SUMMARY.ts_type
)
_PROMPT_DEEP_SCAN = _load_prompt(
    "deep_scan.md", schema=schemas.DEEP_SCAN.ts_type, fields=_LEGAL_REVIEW_FIELDS
)
PROMPT_COMMENT_SENTIMENT_SUMMARY = _load_prompt(
    "comment_sentiment.md", schema=schemas.COMMENT_SEN.ts_type
)
_PROMPT_COMMENT_MODERATION = _load_prompt(
    "comment_moderation.md", schema=schemas.COMMENT_MOD.ts_type
)


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
            # Sleep in small increments so daemon thread can be joined promptly on shutdown
            for _ in range(int(retry_delay)):
                time.sleep(1)
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
        model=os.environ.get(
            "OPENAI_MODEL_FAST", "openai/gemini-2.5-flash-preview-05-20"
        ),
    )

    schemas.TOS_CHECK.validate(result_dict)
    return cast(TosReviewCheck, result_dict)


def prompt_legal_change_summary(
    diff: str, service_name: str, document_kind: str
) -> str:
    """Describe one legal document edit in plain English.

    The model only describes the diff. Whether the change counted as a change at
    all was already decided deterministically, so a document cannot argue its
    way out of being flagged.
    """
    scope = (
        f"The document is the {document_kind.lower()} document of the service "
        f"named exactly '{service_name}'.\n\n"
    )
    messages: List[ChatCompletionMessageParam] = [
        {"role": "system", "content": _today() + scope + _PROMPT_LEGAL_CHANGE_SUMMARY},
        {"role": "user", "content": diff},
    ]

    result_dict = query_openai_json(messages)

    schemas.LEGAL_CHANGE_SUMMARY.validate(result_dict)
    return cast(str, result_dict["summary"])


def prompt_deep_scan(
    content: str,
    service_name: str,
    attribute_catalog_md: str,
    current_attribute_ids: list[int],
    listing_record: dict[str, str],
) -> DeepScanResultType:
    scope = (
        f"You are reviewing the service named exactly '{service_name}'. "
        "The corpus may include clauses that apply to sibling products from the same operator "
        "(e.g. shared legal terms covering multiple products). Include only clauses that apply "
        f"to '{service_name}' or to the operator/account level that affects it. Exclude clauses "
        "explicitly scoped to a different product, unless the same clause also applies to "
        f"'{service_name}'.\n\n"
    )

    user_payload = (
        "## Attribute catalog (use these IDs verbatim when proposing add/remove)\n\n"
        f"{attribute_catalog_md}\n\n"
        "## Attribute IDs currently assigned to this service\n\n"
        f"{current_attribute_ids}\n\n"
        "## Platform record for this service (compare against the documents)\n\n"
        + "".join(
            f"- {field}: {value or '(not set)'}\n"
            for field, value in listing_record.items()
        )
        + "\n"
        "## Legal corpus\n\n"
        f"{content}"
    )

    messages: List[ChatCompletionMessageParam] = [
        {"role": "system", "content": _today() + scope + _PROMPT_DEEP_SCAN},
        {"role": "user", "content": user_payload},
    ]

    result_dict = query_openai_json(messages)

    schemas.DEEP_SCAN.validate(result_dict)
    return cast(DeepScanResultType, result_dict)


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
