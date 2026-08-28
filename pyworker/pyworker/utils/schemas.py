from dataclasses import dataclass
from typing import Any, Callable


@dataclass
class PromptSchema:
    ts_type: str
    validate: Callable[[dict[str, Any]], None]


# Mirrors the topic union in TOS_REVIEW.ts_type and the TosReview type in the web app.
HIGHLIGHT_TOPICS = frozenset(
    {
        "custody",
        "dataSharing",
        "disputes",
        "fundBlocking",
        "jurisdiction",
        "logging",
        "other",
        "refunds",
        "verification",
    }
)


def _validate_highlights(highlights: list[Any]) -> None:
    for i, h in enumerate(highlights):
        if not isinstance(h, dict):
            raise ValueError(f"highlights[{i}] must be a dict")
        for field in ("title", "content", "rating"):
            if field not in h:
                raise ValueError(f"highlights[{i}] missing field: {field}")
        if h["rating"] not in ("negative", "neutral", "positive"):
            raise ValueError(f"highlights[{i}].rating must be negative|neutral|positive, got {h['rating']!r}")
        # A model that omits topic, evidence or sourceUrl costs that highlight
        # its extra detail; rejecting here would cost the service its review.
        if "topic" in h and h["topic"] not in HIGHLIGHT_TOPICS:
            raise ValueError(f"highlights[{i}].topic must be one of {sorted(HIGHLIGHT_TOPICS)}, got {h['topic']!r}")
        for field in ("evidence", "sourceUrl"):
            if field in h and not isinstance(h[field], str):
                raise ValueError(f"highlights[{i}].{field} must be a string")


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

    _validate_highlights(data["highlights"])


def _validate_deep_scan(data: dict[str, Any]) -> None:
    required = {
        "kycLevel",
        "summary",
        "complexity",
        "highlights",
        "kycPolicyNotesMd",
        "kycLevelRationale",
        "attributesToAdd",
        "attributesToRemove",
        "warnings",
    }
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

    _validate_highlights(data["highlights"])

    for str_field in ("kycPolicyNotesMd", "kycLevelRationale"):
        if not isinstance(data[str_field], str):
            raise ValueError(f"{str_field} must be a string")

    for list_field in ("attributesToAdd", "attributesToRemove"):
        if not isinstance(data[list_field], list):
            raise ValueError(f"{list_field} must be a list")
        for i, a in enumerate(data[list_field]):
            if not isinstance(a, dict):
                raise ValueError(f"{list_field}[{i}] must be a dict")
            if not isinstance(a.get("attributeId"), int):
                raise ValueError(f"{list_field}[{i}].attributeId must be an int")
            if not isinstance(a.get("rationale"), str):
                raise ValueError(f"{list_field}[{i}].rationale must be a string")

    if not isinstance(data["warnings"], list):
        raise ValueError("warnings must be a list")
    for i, w in enumerate(data["warnings"]):
        if not isinstance(w, dict):
            raise ValueError(f"warnings[{i}] must be a dict")
        for field in ("title", "bodyMd", "severity"):
            if field not in w:
                raise ValueError(f"warnings[{i}] missing field: {field}")
        if w["severity"] not in ("info", "warning", "alert"):
            raise ValueError(f"warnings[{i}].severity must be info|warning|alert, got {w['severity']!r}")


def _validate_comment_moderation(data: dict[str, Any]) -> None:
    required = {
        "recommendedAction",
        "reasoning",
        "commentQuality",
        "isSpam",
        "isBrigade",
        "brigadeConfidence",
        "ratingShouldBeDisabled",
        "contextNote",
    }
    missing = required - data.keys()
    if missing:
        raise ValueError(f"Missing required fields: {missing}")

    if data["recommendedAction"] not in ("approve", "reject", "human_review"):
        raise ValueError(
            f"recommendedAction must be approve|reject|human_review, got {data['recommendedAction']!r}"
        )

    for bool_field in ("isSpam", "isBrigade", "ratingShouldBeDisabled"):
        if not isinstance(data[bool_field], bool):
            raise ValueError(f"{bool_field} must be a bool, got {type(data[bool_field])}")

    for str_field in ("reasoning", "contextNote"):
        if not isinstance(data[str_field], str):
            raise ValueError(f"{str_field} must be a string")

    quality = data["commentQuality"]
    if not isinstance(quality, int) or quality not in range(11):
        raise ValueError(f"commentQuality must be an int in 0-10, got {quality!r}")

    confidence = data["brigadeConfidence"]
    if not isinstance(confidence, int) or confidence not in range(6):
        raise ValueError(f"brigadeConfidence must be an int in 0-5, got {confidence!r}")

    if data["isSpam"] and data["recommendedAction"] == "approve":
        raise ValueError("isSpam cannot be true when recommendedAction is approve")
    if data["isBrigade"] and confidence == 0:
        raise ValueError("isBrigade cannot be true when brigadeConfidence is 0")


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

def _validate_legal_change_summary(data: dict[str, Any]) -> None:
    if "summary" not in data:
        raise ValueError("Missing required field: summary")
    if not isinstance(data["summary"], str) or not data["summary"].strip():
        raise ValueError("summary must be a non-empty string")


LEGAL_CHANGE_SUMMARY = PromptSchema(
    ts_type="""type LegalChangeSummary = {
    /** Less than 240 characters. Plain English description of what the edit changes for the reader. */
    summary: MarkdownString
}""",
    validate=_validate_legal_change_summary,
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
        /** Which aspect of the service this concerns. */
        topic: 'custody' | 'dataSharing' | 'disputes' | 'fundBlocking' | 'jurisdiction' | 'logging' | 'other' | 'refunds' | 'verification'
        /** The clause this is based on, quoted from the corpus verbatim. Max 300 characters. */
        evidence: string
        /** The `===== PAGE: <url>` the quoted clause came from. */
        sourceUrl: string
    }[] // max 10 highlights, but typically 3-6. Quality over quantity, do not pad. May be empty.
}""",
    validate=_validate_tos_review,
)

DEEP_SCAN = PromptSchema(
    ts_type="""type DeepScan = {
    /** 0=Guaranteed no KYC, 1=No KYC mention, 2=KYC on authorities request, 3=Shotgun KYC, 4=Mandatory KYC */
    kycLevel: 0 | 1 | 2 | 3 | 4
    /** Less than 200 characters. Plain English description of what the document does. */
    summary: MarkdownString
    complexity: 'high' | 'low' | 'medium'
    highlights: {
        /** Very short title, max 2-3 words */
        title: string
        /** Less than 200 characters. */
        content: MarkdownString
        rating: 'negative' | 'neutral' | 'positive'
    }[]
    /** Concise plain-English markdown notes describing the service's KYC policy. At most 2 short lines when possible. May be empty string. */
    kycPolicyNotesMd: MarkdownString
    /** One short paragraph explaining why kycLevel was chosen. */
    kycLevelRationale: string
    /** Attributes to add. attributeId must come from the provided catalog. */
    attributesToAdd: {
        attributeId: number
        /** Why the attribute applies to this service, evidence-grounded. */
        rationale: string
    }[]
    /** Attributes the service currently has that no longer apply per the corpus. */
    attributesToRemove: {
        attributeId: number
        rationale: string
    }[]
    /** User-facing warnings. Reserve 'alert' for material risks. May be empty. */
    warnings: {
        title: string
        bodyMd: MarkdownString
        severity: 'info' | 'warning' | 'alert'
    }[]
}""",
    validate=_validate_deep_scan,
)

COMMENT_MOD = PromptSchema(
    ts_type="""interface CommentModeration {
  /** Top-level decision. Server may downgrade approve -> human_review when hard gates apply (privateProof present, strictCommentingEnabled on a root review, kycIssueClaimed, fundsBlockedClaimed, high-confidence brigade). Reject and human_review are always honored. */
  recommendedAction: 'approve' | 'reject' | 'human_review';
  /** 1-3 sentences, internal-only. Cite the specific signals you used. */
  reasoning: string;
  /** 0=worthless, 10=excellent. */
  commentQuality: 0|1|2|3|4|5|6|7|8|9|10;
  /** True only when the comment is spam outright. Cannot coexist with recommendedAction=approve. */
  isSpam: boolean;
  /** True when cluster signals indicate coordinated activity. */
  isBrigade: boolean;
  /** 0=no signal, 5=certain. Must be > 0 when isBrigade=true. */
  brigadeConfidence: 0|1|2|3|4|5;
  /** Only meaningful for root reviews with a rating. The comment may stay approved while the star rating is killed. */
  ratingShouldBeDisabled: boolean;
  /** User-visible. Empty string when no note is needed. */
  contextNote: string;
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
