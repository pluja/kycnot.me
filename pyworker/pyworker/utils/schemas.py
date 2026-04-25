from dataclasses import dataclass
from typing import Any, Callable


@dataclass
class PromptSchema:
    ts_type: str
    validate: Callable[[dict[str, Any]], None]


def _validate_tos_check(data: dict[str, Any]) -> None:
    if "isComplete" not in data:
        raise ValueError("Missing required field: isComplete")
    if not isinstance(data["isComplete"], bool):
        raise ValueError(f"isComplete must be a bool, got {type(data['isComplete'])}")


def _validate_tos_review(data: dict[str, Any]) -> None:
    required = {"kycLevel", "summary", "complexity", "highlights"}
    missing = required - data.keys()
    if missing:
        raise ValueError(f"Missing required fields: {missing}")

    kyc = data["kycLevel"]
    if not isinstance(kyc, int) or kyc not in range(5):
        raise ValueError(f"kycLevel must be an int in 0-4, got {kyc!r}")

    if not isinstance(data["summary"], str):
        raise ValueError("summary must be a string")

    if data["complexity"] not in ("low", "medium", "high"):
        raise ValueError(f"complexity must be low|medium|high, got {data['complexity']!r}")

    if not isinstance(data["highlights"], list):
        raise ValueError("highlights must be a list")

    for i, h in enumerate(data["highlights"]):
        if not isinstance(h, dict):
            raise ValueError(f"highlights[{i}] must be a dict")
        for field in ("title", "content", "rating"):
            if field not in h:
                raise ValueError(f"highlights[{i}] missing field: {field}")
        if h["rating"] not in ("negative", "neutral", "positive"):
            raise ValueError(f"highlights[{i}].rating must be negative|neutral|positive, got {h['rating']!r}")


def _validate_comment_moderation(data: dict[str, Any]) -> None:
    required = {"isSpam", "requiresAdminReview", "contextNote", "internalNote", "commentQuality"}
    missing = required - data.keys()
    if missing:
        raise ValueError(f"Missing required fields: {missing}")

    for bool_field in ("isSpam", "requiresAdminReview"):
        if not isinstance(data[bool_field], bool):
            raise ValueError(f"{bool_field} must be a bool, got {type(data[bool_field])}")

    for str_field in ("contextNote", "internalNote"):
        if not isinstance(data[str_field], str):
            raise ValueError(f"{str_field} must be a string")

    quality = data["commentQuality"]
    if not isinstance(quality, int) or quality not in range(11):
        raise ValueError(f"commentQuality must be an int in 0-10, got {quality!r}")


def _validate_comment_sentiment(data: dict[str, Any]) -> None:
    required = {"summary", "sentiment", "whatUsersLike", "whatUsersDislike"}
    missing = required - data.keys()
    if missing:
        raise ValueError(f"Missing required fields: {missing}")

    if not isinstance(data["summary"], str):
        raise ValueError("summary must be a string")

    if data["sentiment"] not in ("positive", "negative", "neutral"):
        raise ValueError(f"sentiment must be positive|negative|neutral, got {data['sentiment']!r}")

    for list_field in ("whatUsersLike", "whatUsersDislike"):
        if not isinstance(data[list_field], list):
            raise ValueError(f"{list_field} must be a list")


TOS_CHECK = PromptSchema(
    ts_type='{ "isComplete": true } | { "isComplete": false }',
    validate=_validate_tos_check,
)

TOS_REVIEW = PromptSchema(
    ts_type="""type TosReview = {
    kycLevel: 0 | 1 | 2 | 3 | 4
    /** Less than 200 characters */
    summary: MarkdownString
    complexity: 'high' | 'low' | 'medium'
    highlights: {
        /** Very short title, max 2-3 words */
        title: string
        /** Less than 200 characters. Highlight the most important information with markdown formatting. */
        content: MarkdownString
        /** In regards to KYC, Privacy, Anonymity, Self-Sovereignity, etc. */
        /** anything that could harm the user's privacy, identity, self-sovereignity or anonymity is negative, anything that otherwise helps is positive. else it is neutral. */
        rating: 'negative' | 'neutral' | 'positive'
    }[] // max 10 highlights, but typically 3-6. Quality over quantity, do not pad. May be empty.
}""",
    validate=_validate_tos_review,
)

COMMENT_MOD = PromptSchema(
    ts_type="""interface CommentModeration {
  isSpam: boolean;
  requiresAdminReview: boolean;
  contextNote: string;
  internalNote: string;
  commentQuality: 0|1|2|3|4|5|6|7|8|9|10;
}""",
    validate=_validate_comment_moderation,
)

COMMENT_SEN = PromptSchema(
    ts_type="""interface CommentSummary {
  summary: string; // 1-2 sentences, 50 words max, no markdown
  sentiment: 'positive'|'negative'|'neutral';
  whatUsersLike: string[]; // 0-5 items, 1-3 words each, prefer 3 or fewer
  whatUsersDislike: string[]; // 0-5 items, 1-3 words each, prefer 3 or fewer
}""",
    validate=_validate_comment_sentiment,
)
