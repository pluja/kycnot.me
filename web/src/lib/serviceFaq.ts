import { answerText, type ServiceAnswer } from './serviceAnswers'
import { stripMarkdown } from './strings'

type FaqInput = {
  name: string
  description: string
  /** The generated one-paragraph summary: category, currencies, KYC, score. */
  summary: string
  questions: { kyc: string; trust: string }
  kyc: ServiceAnswer
  safety: ServiceAnswer
  isFlaggedScam: boolean
  statusLabel: string
  statusDescription: string
  currencyNames: string[]
  onionHosts: string[]
  i2pHosts: string[]
  ratingCount: number
  averageRating: number | null
  tosSummary: string | null
}

export type FaqEntry = { question: string; answer: string }

const sentenceList = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' })

/**
 * Questions people type into a search box about a service, answered from the
 * same data the page shows. They ship as FAQPage structured data only: the
 * page already answers them in its own layout, so nothing here is rendered.
 */
export function makeServiceFaq(input: FaqInput): FaqEntry[] {
  const { name } = input
  const entries: (FaqEntry | false)[] = [
    {
      question: `What is ${name}?`,
      answer: [stripMarkdown(input.description), input.summary].filter(Boolean).join(' '),
    },
    { question: input.questions.kyc, answer: answerText(input.kyc) },
    { question: input.questions.trust, answer: answerText(input.safety) },
    {
      question: `Is ${name} a scam?`,
      answer: input.isFlaggedScam
        ? `${name} is flagged as a scam on KYCnot.me. ${input.statusDescription}`
        : `${name} is not flagged as a scam. Its listing status is ${input.statusLabel}: ${input.statusDescription} ${answerText(input.safety)}`,
    },
    input.currencyNames.length > 0 && {
      question: `Which currencies does ${name} accept?`,
      answer: `${name} accepts ${sentenceList.format(input.currencyNames)}.`,
    },
    (input.onionHosts.length > 0 || input.i2pHosts.length > 0) && {
      question: `Does ${name} have a Tor onion or I2P address?`,
      answer: [
        input.onionHosts.length > 0 &&
          `Yes, ${name} has a Tor onion service: ${input.onionHosts.join(', ')}.`,
        input.i2pHosts.length > 0 && `${name} is also reachable over I2P: ${input.i2pHosts.join(', ')}.`,
      ]
        .filter(Boolean)
        .join(' '),
    },
    input.ratingCount > 0 &&
      input.averageRating !== null && {
        question: `How do users rate ${name}?`,
        answer: `${name} has ${String(input.ratingCount)} user ${input.ratingCount === 1 ? 'rating' : 'ratings'} on KYCnot.me, averaging ${input.averageRating.toFixed(1)} out of 5.`,
      },
    !!input.tosSummary && {
      question: `What do the terms of service of ${name} say?`,
      answer: stripMarkdown(input.tosSummary),
    },
  ]
  return entries.filter((entry): entry is FaqEntry => !!entry)
}
