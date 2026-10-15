import type { EvidenceFinding } from '@prisma/client'

// defaultCheckTexts is the public wording for each result. The form fills it in when a result is picked, and a check
// gets it when the moderator leaves the explanation empty.
export const defaultCheckTexts = {
  ORDER_FOUND: {
    explanation: "The service's order lookup found this order. Order details were not verified.",
  },
  SCREENSHOT_REVIEWED: {
    explanation: 'The author sent a screenshot that matches the post. Screenshots can be faked.',
  },
  TRANSACTION_SUPPORTED: {
    explanation: "The author's proof shows the payment went through. It doesn't show who made it.",
  },
  REFUND_SUPPORTED: {
    explanation: "The author's proof shows the service issued a refund.",
  },
  CLAIM_SUPPORTED: {
    explanation: "The author's proof shows the problem the post describes.",
  },
  ORDER_NOT_FOUND: {
    explanation: "The service's order lookup didn't find this order.",
  },
  UNABLE_TO_CHECK: {
    explanation: "We couldn't check this proof, so we can't say whether the post is accurate.",
  },
  INCONSISTENT: {
    explanation: "The proof doesn't match what the post describes.",
  },
} as const satisfies Record<Exclude<EvidenceFinding, 'LEGACY'>, { explanation: string }>

const standardTexts = new Set<string>(Object.values(defaultCheckTexts).map((texts) => texts.explanation))

// checkText is the submitted text, or the result's standard wording when the field was left empty or still holds
// another result's wording, as it does when the result was changed without scripts.
export function checkText(finding: keyof typeof defaultCheckTexts, submitted: string | undefined) {
  return submitted && !standardTexts.has(submitted) ? submitted : defaultCheckTexts[finding].explanation
}
