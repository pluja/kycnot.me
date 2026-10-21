import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { Assert } from '../lib/assert'
import type { CommentRule } from '@prisma/client'
import type { Equals } from 'ts-toolbelt/out/Any/Equals'

type CommentRuleInfo<T extends string | null | undefined = string> = {
  value: T
  label: string
  description: string
  icon: string
  // A rejection for this rule counts against the author's trust.
  penalizes: boolean
  // Readers can pick it when reporting a post.
  reportable: boolean
  requiresDetails: boolean
}

export const {
  dataArray: commentRules,
  getFn: getCommentRuleInfo,
  zodEnumById: commentRulesZodEnumByValue,
} = makeHelpersForOptions(
  'value',
  (value): CommentRuleInfo<typeof value> => ({
    value,
    label: value ? transformCase(value.replaceAll('_', ' '), 'sentence') : String(value),
    description: '',
    icon: 'ri:flag-line',
    penalizes: false,
    reportable: false,
    requiresDetails: false,
  }),
  [
    {
      value: 'SPAM',
      label: 'Spam or advertising',
      description: 'Promotes a product, a referral link or another service.',
      icon: 'ri:megaphone-line',
      penalizes: true,
      reportable: true,
      requiresDetails: false,
    },
    {
      value: 'SCAM_CONTACT',
      label: 'Scam link or contact',
      description: 'Points readers to a phishing site, a fake support contact or a scam.',
      icon: 'ri:error-warning-line',
      penalizes: true,
      reportable: true,
      requiresDetails: false,
    },
    {
      value: 'HARASSMENT',
      label: 'Harassment or threats',
      description: 'Attacks or threatens a person.',
      icon: 'ri:emotion-unhappy-line',
      penalizes: true,
      reportable: true,
      requiresDetails: false,
    },
    {
      value: 'SLUR',
      label: 'Slur or abusive language',
      description: 'Uses slurs or abusive language.',
      icon: 'ri:forbid-line',
      penalizes: true,
      reportable: true,
      requiresDetails: false,
    },
    {
      value: 'PRIVATE_INFO',
      label: 'Private information',
      description: 'Shares names, addresses, order details or anything that identifies someone.',
      icon: 'ri:spy-line',
      penalizes: true,
      reportable: true,
      requiresDetails: false,
    },
    {
      value: 'NOT_GENUINE',
      label: 'Not a genuine experience',
      description: 'The comment describes something that did not happen.',
      icon: 'ri:question-line',
      penalizes: true,
      reportable: true,
      requiresDetails: false,
    },
    {
      value: 'DUPLICATE',
      label: 'Duplicate',
      description: 'Repeats a comment the same author already made.',
      icon: 'ri:file-copy-line',
      penalizes: false,
      reportable: false,
      requiresDetails: false,
    },
    {
      value: 'NO_LONGER_APPLIES',
      label: 'No longer applies',
      description: 'Outdated: no longer true or relevant.',
      icon: 'ri:history-line',
      penalizes: false,
      reportable: false,
      requiresDetails: false,
    },
    {
      value: 'AUTHOR_REQUEST',
      label: "Author's request",
      description: 'The author asked for it to come down.',
      icon: 'ri:user-shared-line',
      penalizes: false,
      reportable: false,
      requiresDetails: false,
    },
    {
      value: 'OFF_TOPIC',
      label: 'Off-topic',
      description: 'Not about this service.',
      icon: 'ri:question-answer-line',
      penalizes: false,
      reportable: false,
      requiresDetails: false,
    },
    {
      value: 'NOT_ENOUGH_DETAIL',
      label: 'Not enough detail',
      description:
        "Doesn't say what you used the service for or what happened. Post again with the specifics.",
      icon: 'ri:file-list-line',
      penalizes: false,
      reportable: false,
      requiresDetails: false,
    },
    {
      value: 'OTHER',
      label: 'Other',
      description: 'Explain in the details.',
      icon: 'ri:more-line',
      penalizes: false,
      reportable: false,
      requiresDetails: true,
    },
  ] as const satisfies CommentRuleInfo<CommentRule>[]
)

export const reportableCommentRules = commentRules.filter((rule) => rule.reportable)

type _ExpectAllRules = Assert<Equals<(typeof commentRules)[number]['value'], CommentRule>>
