import { EvidenceFinding, EvidenceKind, ExperienceOutcome, ExperienceSentiment } from '@prisma/client'

import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'

import type { Assert } from '../lib/assert'
import type { TailwindColor } from '../lib/colors'
import type { ProofSummary } from '../lib/proofEvidence'
import type { CommentIssueType } from '@prisma/client'
import type { Equals } from 'ts-toolbelt/out/Any/Equals'

const fallback = <T extends string | null | undefined>(value: T) => ({ value, label: value ?? '' })

type ExperienceSentimentInfo<T extends string | null | undefined = string> = {
  value: T
  slug: string
  label: string
  shortLabel: string
  icon: string
  color: 'green' | 'red' | 'yellow'
  classNames: { text: string; bar: string; checked: string }
}

export const {
  dataArray: experienceSentiments,
  dataObject: experienceSentimentsByValue,
  getFn: getExperienceSentimentInfo,
  zodEnumBySlug: experienceSentimentsZodEnumBySlug,
} = makeHelpersForOptions(
  'value',
  (value): ExperienceSentimentInfo<typeof value> => ({
    value,
    slug: value ? value.toLowerCase() : '',
    label: value ?? '',
    shortLabel: value ?? '',
    icon: 'ri:question-line',
    color: 'yellow',
    classNames: { text: 'text-day-300', bar: 'bg-day-500', checked: 'has-checked:border-day-300' },
  }),
  [
    {
      value: ExperienceSentiment.POSITIVE,
      slug: 'positive',
      label: 'Positive',
      shortLabel: 'Positive',
      icon: 'ri:thumb-up-line',
      color: 'green',
      classNames: {
        text: 'text-green-300',
        bar: 'bg-green-500',
        checked: 'has-checked:border-green-500 has-checked:bg-green-500/15',
      },
    },
    {
      value: ExperienceSentiment.NEUTRAL,
      slug: 'neutral',
      label: 'Neutral or mixed',
      shortLabel: 'Mixed',
      icon: 'ri:scales-3-line',
      color: 'yellow',
      classNames: {
        text: 'text-yellow-300',
        bar: 'bg-yellow-500',
        checked: 'has-checked:border-yellow-500 has-checked:bg-yellow-500/15',
      },
    },
    {
      value: ExperienceSentiment.NEGATIVE,
      slug: 'negative',
      label: 'Negative',
      shortLabel: 'Negative',
      icon: 'ri:thumb-down-line',
      color: 'red',
      classNames: {
        text: 'text-red-300',
        bar: 'bg-red-500',
        checked: 'has-checked:border-red-500 has-checked:bg-red-500/15',
      },
    },
  ] as const satisfies ExperienceSentimentInfo<ExperienceSentiment>[]
)

type ExperienceOutcomeInfo<T extends string | null | undefined = string> = {
  value: T
  label: string
  formLabel: string
}

export const { dataArray: experienceOutcomes, dataObject: experienceOutcomesByValue } = makeHelpersForOptions(
  'value',
  (value): ExperienceOutcomeInfo<typeof value> => ({ value, label: value ?? '', formLabel: value ?? '' }),
  [
    { value: ExperienceOutcome.UNSPECIFIED, label: 'Not specified', formLabel: 'Not specified' },
    { value: ExperienceOutcome.NO_ISSUE, label: 'No issue reported', formLabel: 'No problem' },
    { value: ExperienceOutcome.ONGOING, label: 'Issue ongoing', formLabel: 'Yes, unresolved' },
    { value: ExperienceOutcome.RESOLVED, label: 'Issue resolved', formLabel: 'Yes, resolved' },
  ] as const satisfies ExperienceOutcomeInfo<ExperienceOutcome>[]
)

type EvidenceFindingInfo<T extends string | null | undefined = string> = {
  value: T
  label: string
  shortLabel: string
  guidance: string
  icon: string
  badgeColor: TailwindColor
  // counts is whether the latest check with this result makes the proof count. LEGACY depends on the old status.
  counts: boolean
  classNames: { text: string; checked: string; strip: string }
}

export const { dataArray: evidenceFindings, dataObject: evidenceFindingsByValue } = makeHelpersForOptions(
  'value',
  (value): EvidenceFindingInfo<typeof value> => ({
    ...fallback(value),
    shortLabel: value ?? '',
    guidance: '',
    icon: 'ri:question-line',
    badgeColor: 'zinc',
    counts: false,
    classNames: {
      text: 'text-day-300',
      strip: 'bg-night-700 text-day-200',
      checked: 'has-checked:border-day-400',
    },
  }),
  [
    {
      value: EvidenceFinding.ORDER_FOUND,
      counts: true,
      label: 'Order found on the service website',
      shortLabel: 'Order ID exists',
      guidance: 'The service lookup found this order. Used only when the lookup refuses made-up IDs.',
      icon: 'ri:file-search-line',
      badgeColor: 'blue',
      classNames: {
        text: 'text-blue-300',
        strip: 'bg-blue-500/10 text-blue-200',
        checked: 'has-checked:border-blue-500 has-checked:bg-blue-500/10',
      },
    },
    {
      value: EvidenceFinding.SCREENSHOT_REVIEWED,
      counts: true,
      label: 'A moderator reviewed a screenshot',
      shortLabel: 'Screenshot reviewed',
      guidance: 'A screenshot matches the post. Screenshots can be faked.',
      icon: 'ri:image-line',
      badgeColor: 'sky',
      classNames: {
        text: 'text-sky-300',
        strip: 'bg-sky-500/10 text-sky-200',
        checked: 'has-checked:border-sky-500 has-checked:bg-sky-500/10',
      },
    },
    {
      value: EvidenceFinding.TRANSACTION_SUPPORTED,
      counts: true,
      label: 'Proof of payment',
      shortLabel: 'Proof of payment',
      guidance: 'The proof shows the swap or payment was completed.',
      icon: 'ri:exchange-line',
      badgeColor: 'green',
      classNames: {
        text: 'text-green-300',
        strip: 'bg-green-500/10 text-green-200',
        checked: 'has-checked:border-green-500 has-checked:bg-green-500/10',
      },
    },
    {
      value: EvidenceFinding.REFUND_SUPPORTED,
      counts: true,
      label: 'Proof of refund',
      shortLabel: 'Proof of refund',
      guidance: 'The proof shows the service refunded the author.',
      icon: 'ri:refund-2-line',
      badgeColor: 'green',
      classNames: {
        text: 'text-green-300',
        strip: 'bg-green-500/10 text-green-200',
        checked: 'has-checked:border-green-500 has-checked:bg-green-500/10',
      },
    },
    {
      value: EvidenceFinding.CLAIM_SUPPORTED,
      counts: true,
      label: 'Proof of the problem the post reports',
      shortLabel: 'Proof of the problem',
      guidance: 'The proof shows the problem the post reports, such as a KYC request or held funds.',
      icon: 'ri:file-shield-2-line',
      badgeColor: 'green',
      classNames: {
        text: 'text-green-300',
        strip: 'bg-green-500/10 text-green-200',
        checked: 'has-checked:border-green-500 has-checked:bg-green-500/10',
      },
    },
    {
      value: EvidenceFinding.ORDER_NOT_FOUND,
      counts: false,
      label: 'The service lookup did not find this order',
      shortLabel: 'Order not found',
      guidance: 'The lookup works and says this order does not exist.',
      icon: 'ri:file-forbid-line',
      badgeColor: 'amber',
      classNames: {
        text: 'text-amber-300',
        strip: 'bg-amber-500/10 text-amber-200',
        checked: 'has-checked:border-amber-500 has-checked:bg-amber-500/10',
      },
    },
    {
      value: EvidenceFinding.UNABLE_TO_CHECK,
      counts: false,
      label: 'We could not check this proof',
      shortLabel: 'Could not check',
      guidance: 'Lookup locked, expired or unavailable. Says nothing about whether the post is true.',
      icon: 'ri:question-line',
      badgeColor: 'zinc',
      classNames: {
        text: 'text-day-300',
        strip: 'bg-night-700 text-day-200',
        checked: 'has-checked:border-day-400 has-checked:bg-night-700',
      },
    },
    {
      value: EvidenceFinding.INCONSISTENT,
      counts: false,
      label: 'Proof does not support the claim',
      shortLabel: 'Proof inconsistent',
      guidance: 'What was sent contradicts or does not match the post.',
      icon: 'ri:error-warning-line',
      badgeColor: 'red',
      classNames: {
        text: 'text-red-300',
        strip: 'bg-red-500/10 text-red-200',
        checked: 'has-checked:border-red-500 has-checked:bg-red-500/10',
      },
    },
    {
      value: EvidenceFinding.LEGACY,
      counts: false,
      label: 'Check imported from the previous system',
      shortLabel: 'Older check',
      guidance: '',
      icon: 'ri:archive-line',
      badgeColor: 'zinc',
      classNames: {
        text: 'text-day-400',
        strip: 'bg-night-700 text-day-300',
        checked: 'has-checked:border-day-400',
      },
    },
  ] as const satisfies EvidenceFindingInfo<EvidenceFinding>[]
)

export const countingFindings: EvidenceFinding[] = evidenceFindings
  .filter((finding) => finding.counts)
  .map((finding) => finding.value)

type EvidenceKindInfo<T extends string | null | undefined = string> = {
  value: T
  label: string
  icon: string
}

export const { dataArray: evidenceKinds, dataObject: evidenceKindsByValue } = makeHelpersForOptions(
  'value',
  (value): EvidenceKindInfo<typeof value> => ({ value, label: value ?? '', icon: 'ri:file-line' }),
  [
    { value: EvidenceKind.ORDER_ID, label: 'Order ID', icon: 'ri:hashtag' },
    { value: EvidenceKind.LOOKUP_LINK, label: 'Order link', icon: 'ri:links-line' },
    { value: EvidenceKind.TRANSACTION_ID, label: 'Transaction ID or address', icon: 'ri:exchange-line' },
    { value: EvidenceKind.EXTERNAL_LINK, label: 'External link', icon: 'ri:external-link-line' },
    { value: EvidenceKind.SCREENSHOT, label: 'Screenshot', icon: 'ri:image-line' },
    { value: EvidenceKind.NOTE, label: 'Note', icon: 'ri:file-text-line' },
  ] as const satisfies EvidenceKindInfo<EvidenceKind>[]
)

type ProofSummaryInfo<T extends string | null | undefined = string> = {
  value: T
  label: string
  icon: string
  tooltip: string
}

export const { dataObject: proofSummariesByValue } = makeHelpersForOptions(
  'value',
  (value): ProofSummaryInfo<typeof value> => ({
    value,
    label: value ?? '',
    icon: 'ri:question-line',
    tooltip: '',
  }),
  [
    {
      value: 'checked',
      label: 'Checked proof',
      icon: 'ri:checkbox-circle-line',
      tooltip: 'A moderator checked the proof of use.',
    },
    {
      value: 'unchecked',
      label: 'Proof not checked yet',
      icon: 'ri:time-line',
      tooltip: 'Proof was sent privately and is waiting for a moderator.',
    },
    {
      value: 'none',
      label: 'No proof',
      icon: 'ri:question-line',
      tooltip: 'No proof of use was accepted by a moderator.',
    },
  ] as const satisfies ProofSummaryInfo<ProofSummary>[]
)

type _ExpectAllSentiments = Assert<
  Equals<(typeof experienceSentiments)[number]['value'], ExperienceSentiment>
>
type _ExpectAllOutcomes = Assert<Equals<(typeof experienceOutcomes)[number]['value'], ExperienceOutcome>>
type _ExpectAllEvidenceKinds = Assert<Equals<(typeof evidenceKinds)[number]['value'], EvidenceKind>>
type _ExpectAllFindings = Assert<Equals<(typeof evidenceFindings)[number]['value'], EvidenceFinding>>

export function findingLabel(finding: EvidenceFinding, issues: readonly CommentIssueType[]) {
  if (finding === 'CLAIM_SUPPORTED' && issues.length === 1) {
    if (issues[0] === 'KYC_REQUESTED') return 'Proof of KYC request'
    if (issues[0] === 'FUNDS_BLOCKED') return 'Proof of held funds'
  }
  return evidenceFindingsByValue[finding].shortLabel
}
