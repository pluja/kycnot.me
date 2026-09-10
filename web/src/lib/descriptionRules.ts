import { z } from 'zod'

import rules from '../../../pyworker/tests/fixtures/description_rules.json'

export type DescriptionViolation =
  | 'dash'
  | 'empty'
  | 'exclamation'
  | 'first-person'
  | 'length'
  | 'marketing'
  | 'policy'
  | 'sentences'

export const DESCRIPTION_MAX_LENGTH: number = rules.maxLength

/**
 * The editorial rule for a service description, in the words shown next to
 * the field. The mechanical half lives in checkDescription; the judgement half
 * (a label like "no-KYC exchange" only when the listing supports it) is what
 * the reviewer and the scan prompt carry.
 */
export const DESCRIPTION_RULE =
  'One or two sentences, under 200 characters, that say what the service is and does. Third person, no marketing words, no exclamation marks, no dashes, nothing about terms, policies or restrictions.'

const violationMessages: Record<DescriptionViolation, string> = {
  dash: 'No dashes. Use a comma or a full stop.',
  empty: 'Write a description.',
  exclamation: 'No exclamation marks.',
  'first-person': 'Third person: no "we", "our" or "us".',
  length: `At most ${String(rules.maxLength)} characters.`,
  marketing: 'No marketing or promotional words.',
  policy:
    'Nothing about terms, policies, restrictions or identity checks. Those have their own place on the page.',
  sentences: `At most ${String(rules.maxSentences)} sentences.`,
}

export const describeViolations = (violations: DescriptionViolation[]) =>
  violations.map((violation) => violationMessages[violation])

const phrasePattern = (phrases: string[]) =>
  new RegExp(
    `(^|[^a-z])(${phrases.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?=$|[^a-z])`,
    'i'
  )

const marketingPattern = phrasePattern(rules.marketingWords)
const policyPattern = phrasePattern(rules.policyWords)

// Sentence ends: a terminator followed by space and a capital, or the end. A
// dot inside "e.g." or a version number is not followed by a capital letter.
const countSentences = (text: string) =>
  text.split(/[.!?]+(?:\s+(?=[A-Z0-9"'(])|$)/).filter((s) => s.trim()).length

/**
 * The mechanical part of the description rule, shared with the worker through
 * the fixture the rules are read from. Returns every rule the text breaks.
 */
export const checkDescription = (text: string): DescriptionViolation[] => {
  const trimmed = text.trim()
  if (!trimmed) return ['empty']
  const violations: DescriptionViolation[] = []
  if (trimmed.length > rules.maxLength) violations.push('length')
  if (countSentences(trimmed) > rules.maxSentences) violations.push('sentences')
  if (/[–—]|(^|\s)-{2,}(\s|$)|\s-\s/.test(trimmed)) violations.push('dash')
  if (trimmed.includes('!')) violations.push('exclamation')
  if (/(^|[^a-z])(we|our|ours|us)(?=$|[^a-z])/i.test(trimmed)) violations.push('first-person')
  if (marketingPattern.test(trimmed)) violations.push('marketing')
  if (policyPattern.test(trimmed)) violations.push('policy')
  return violations
}

/** The field schema both service forms share, reporting every broken rule at once. */
export const descriptionSchema = z
  .string()
  .trim()
  .superRefine((text, ctx) => {
    for (const message of describeViolations(checkDescription(text))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message })
    }
  })
