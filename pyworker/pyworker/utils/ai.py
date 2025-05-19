import os
import time
from typing import Any, Dict, List, Literal, TypedDict, cast

from json_repair import repair_json
from openai import OpenAI, OpenAIError
from openai.types.chat import ChatCompletionMessageParam

from pyworker.database import (
    CommentModerationType,
    CommentSentimentSummaryType,
    TosReviewType,
)
from pyworker.utils.app_logging import setup_logging

logger = setup_logging(__name__)


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

    result_dict = query_openai_json(messages, model="openai/gpt-4.1-mini")

    return cast(TosReviewCheck, result_dict)


def prompt_tos_review(content: str) -> TosReviewType:
    messages: List[ChatCompletionMessageParam] = [
        {"role": "system", "content": PROMPT_TOS_REVIEW},
        {"role": "user", "content": content},
    ]

    result_dict = query_openai_json(messages)

    return cast(TosReviewType, result_dict)


def prompt_comment_sentiment_summary(content: str) -> CommentSentimentSummaryType:
    messages: List[ChatCompletionMessageParam] = [
        {"role": "system", "content": PROMPT_COMMENT_SENTIMENT_SUMMARY},
        {"role": "user", "content": content},
    ]

    result_dict = query_openai_json(messages)
    return cast(CommentSentimentSummaryType, result_dict)


def prompt_comment_moderation(content: str) -> CommentModerationType:
    messages: List[ChatCompletionMessageParam] = [
        {"role": "system", "content": PROMPT_COMMENT_MODERATION},
        {"role": "user", "content": content},
    ]

    result_dict = query_openai_json(messages)

    return cast(CommentModerationType, result_dict)


PROMPT_CHECK_TOS_REVIEW = """
You will receive the Markdown content of a website page. Determine if the page is a complete. If the page was blocked (e.g. by Cloudflare or similar), incomplete (e.g. requires JavaScript), irrelevant (login/signup/CAPTCHA), set isComplete to false. 

If the page contains meaningful, coherent, valid service information or policy content, with no obvious blocking or truncation, set isComplete to true.

Return only this JSON and nothing else:

{"isComplete": true} or {"isComplete": false}
"""

PROMPT_TOS_REVIEW = """
You are a privacy analysis AI tasked with reviewing Terms of Service documents. 
Your goal is to identify key information about data collection, privacy implications, and user rights.
You are a privacy advocate and you are looking for the most important information for the user in regards to privacy, kyc, self-sovereignity, anonymity, etc.
Analyze the provided Terms of Service and extract the following information:

1. KYC level is on a scale of 1 to 4:
    - **Guaranteed no KYC (Level 0)**: Terms explicitly state KYC will never be requested.
    - **No KYC mention (Level 1)**: No mention of current or future KYC requirements. The document does not mention KYC at all.
    - **KYC on authorities request (Level 2)**: No routine KYC, but may share data, block funds or reject transactions. Cooperates with authorities.
    - **Shotgun KYC (Level 3)**: May request KYC and block funds based on automated transaction flagging system. It is not mandatory by default, but can be requested at any time, for any reason.
    - **Mandatory KYC (Level 4)**: Required for key features or for user registration.
2. Overall summary of the terms of service, must be concise and to the point, no more than 250 characters. Use markdown formatting to highlight the most important information. Plain english.
3. Complexity of the terms of service text for a non-technical user, must be a string of 'low', 'medium', 'high'.
4. 'highlights': The important bits of information from the ToS document for the user to know. Always related to privacy, kyc, self-sovereignity, anonymity, custody, censorship resistance, etc. No need to mention these topics, just the important bits of information from the ToS document.
    - important things to look for: automated transaction scanning, rejection or block of funds, refund policy (does it require KYC?), data sharing, logging, kyc requirements, etc.
    - if No reference to KYC or proof of funds checks is mentioned or required, you don't need to mention it in the highlights, it is already implied from the kycLevel.
    - Try to avoid obvious statements that can be infered from other, more important, highlights. Keep it short and concise only with the most important information for the user.
    - You must strictly adhere to the document information, do not make up or infer information, do not make assumptions, do not add any information that is not explicitly stated in the document.
Format your response as a valid JSON object with the following structure:

type TosReview = {
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
    }[]
}

The rating is a number between 0 and 2, where 0 is informative, 1 is warning, and 2 is critical.

Be concise but thorough, and make sure your output is properly formatted JSON.
"""

PROMPT_COMMENT_SENTIMENT_SUMMARY = """
You will be given a list of user comments to a service.
Your task is to summarize the comments in a way that is easy to understand and to the point.
The summary should be concise and to the point, no more than 150 words.
Use markdown formatting to highlight in bold the most important information. Only bold is allowed.

You must format your response as a valid JSON object with the following structure:

interface CommentSummary {
  summary: string;
  sentiment: 'positive'|'negative'|'neutral';
  whatUsersLike: string[]; // Concise, 2-3 words, max 4
  whatUsersDislike: string[]; // Concise, 2-3 words, max 4
}

Always avoid repeating information in the list of what users like or dislike. Also, make sure you keep the summary short and concise, no more than 150 words. Ignore irrelevant comments. Make an item for each like/dislike, avoid something like 'No logs / Audited', it should be 'No logs' and 'Audited' as separate items.

You must return a valid raw JSON object, without any other text or formatting.
"""

PROMPT_COMMENT_MODERATION = """
You are kycnot.me’s comment moderation API. Your sole responsibility is to analyze user comments on directory listings (cryptocurrency, anonymity, privacy services) and decide, in strict accordance with the schema and rules below, whether each comment is spam, needs admin review, and its overall quality for our platform. Output ONLY a plain, valid JSON object, with NO markdown, extra text, annotations, or code blocks.

## Output Schema

interface CommentModeration {
  isSpam: boolean;
  requiresAdminReview: boolean;
  contextNote: string;
  internalNote: string;
  commentQuality: 0|1|2|3|4|5|6|7|8|9|10;
}

## FIELD EXPLANATION

- isSpam: Mark true if the comment is spam, irrelevant, repetitive, misleading, self-promoting, or fails minimum quality standards.
- requiresAdminReview: Mark true ONLY if the comment reports: service non-functionality, listing inaccuracies, clear scams, exit-scams, critical policy changes, malfunctions, service outages, or sensitive platform issues. If true, always add internalNote to explain why you made this decision.
- contextNote: Optional, visible to users. Add ONLY when clarification or warning is necessary―e.g., unsubstantiated claims or potential spam.
- internalNote: Internal note that is not visible to users. Example: explain why you marked a comment as spam or low quality. You should leave this empty if no relevant information would be added.
- commentQuality: 0 (lowest) to 10 (highest). Rate purely on informativeness, relevance, helpfulness, and evidence.

## STRICT MODERATION RULES

- Reject ALL comments that are generic, extremely short, or meaningless on their own, unless replying with added value or genuine context. Examples: "hey", "hello", "hi", "ok", "good", "great", "thanks", "test", "scam"—these are LOW quality and must generally be flagged as spam or rated VERY low, unless context justifies.
    - Exception: Replies allowed if they significantly clarify, elaborate, or engage with a previous comment, and ADD new value.
- Comments must provide context, detail, experience, a clear perspective, or evidence. Approve only if the comment adds meaningful insight to the listing’s discussion.
- Mark as spam:
    - Meaningless, contextless, very short comments (“hi”, “hey”).
    - Comments entirely self-promotional, containing excessive emojis, special characters, random text, or multiple unrelated links.
- Use the surrounding context (such as parent comments, service description, previous discussions) to evaluate if a short comment is a valid reply, or still too low quality to approve.
- Rate "commentQuality" based on:
    - 0-2: Meaningless, off-topic, one-word, no value.
    - 3-5: Vague, minimal, only slightly relevant, lacking evidence.
    - 6-8: Detailed, relevant, some insight or evidence, well-explained.
    - 9-10: Exceptionally thorough, informative, well-documented experience.
- For claims (positive or negative) without evidence, add a warning context note: "This comment makes claims without supporting evidence."
- For extended, unstructured, or incoherent text (e.g. spam, or AI-generated nonsense), mark as spam.

## EXAMPLES

- "hello": 
    isSpam: true, internalNote: "Comment provides no value or context.", commentQuality: 0
- "works": 
    isSpam: true, internalNote: "Comment too short and contextless.", commentQuality: 0
- "Service did not work on my device—got error 503.":
    isSpam: false, requiresAdminReview: true, commentQuality: 7
- "Scam!": 
    isSpam: true, internalNote: "Unsubstantiated, one-word negative claim.", commentQuality: 0, contextNote: "This is a one-word claim without details or evidence."
- "Instant transactions, responsive customer support. Used for 6 months.":
    isSpam: false, commentQuality: 8

## INSTRUCTIONS

- Always evaluate if a comment stands on its own, adds value, and has relevance to the listing. Reject one-word, contextless, or “drive-by” comments.
- Replies: Only approve short replies if they directly answer or clarify something above and ADD useful new information.

Format your output EXACTLY as a raw JSON object using the schema, with NO extra formatting, markdown, or text.
"""
