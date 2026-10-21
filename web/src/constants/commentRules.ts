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
  // appliesTo says whether moderators can pick it when holding a comment, rejecting it, or both.
  appliesTo: 'both' | 'hold' | 'reject'
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
    appliesTo: 'reject',
  }),
  [
    {
      value: 'SPAM',
      label: 'Spam or advertising',
      description: 'Promotes a product, a referral link or another service, or is gibberish or a test.',
      icon: 'ri:megaphone-line',
      penalizes: true,
      reportable: true,
      requiresDetails: false,
      appliesTo: 'reject',
    },
    {
      value: 'SCAM_CONTACT',
      label: 'Scam link or contact',
      description:
        'Points readers to a phishing site, a fake support contact, a scam or a risky offer such as a cash meetup.',
      icon: 'ri:error-warning-line',
      penalizes: true,
      reportable: true,
      requiresDetails: false,
      appliesTo: 'reject',
    },
    {
      value: 'HARASSMENT',
      label: 'Harassment or threats',
      description: 'Attacks or threatens a person.',
      icon: 'ri:emotion-unhappy-line',
      penalizes: true,
      reportable: true,
      requiresDetails: false,
      appliesTo: 'reject',
    },
    {
      value: 'SLUR',
      label: 'Slur or abusive language',
      description: 'Uses slurs or abusive language.',
      icon: 'ri:forbid-line',
      penalizes: true,
      reportable: true,
      requiresDetails: false,
      appliesTo: 'reject',
    },
    {
      value: 'PRIVATE_INFO',
      label: 'Private information',
      description: 'Shares names, addresses, order details or anything that identifies someone.',
      icon: 'ri:spy-line',
      penalizes: true,
      reportable: true,
      requiresDetails: false,
      appliesTo: 'reject',
    },
    {
      value: 'NOT_GENUINE',
      label: 'Not a genuine experience',
      description: 'Describes something that did not happen, or is part of a coordinated wave of comments.',
      icon: 'ri:question-line',
      penalizes: true,
      reportable: true,
      requiresDetails: false,
      appliesTo: 'reject',
    },
    {
      value: 'PAID_PROMOTION',
      label: 'Promotion',
      description: 'Written to promote the service: paid, by its own team, or copied from its marketing.',
      icon: 'ri:money-dollar-circle-line',
      penalizes: true,
      reportable: true,
      requiresDetails: false,
      appliesTo: 'reject',
    },
    {
      value: 'DUPLICATE',
      label: 'Duplicate or superseded',
      description: 'Repeats a comment the same author already made, or a newer one replaces it.',
      icon: 'ri:file-copy-line',
      penalizes: false,
      reportable: false,
      requiresDetails: false,
      appliesTo: 'reject',
    },
    {
      value: 'NO_LONGER_APPLIES',
      label: 'No longer applies',
      description: 'Outdated: no longer true or relevant.',
      icon: 'ri:history-line',
      penalizes: false,
      reportable: false,
      requiresDetails: false,
      appliesTo: 'reject',
    },
    {
      value: 'AUTHOR_REQUEST',
      label: "Author's request",
      description: 'The author asked for it to come down.',
      icon: 'ri:user-shared-line',
      penalizes: false,
      reportable: false,
      requiresDetails: false,
      appliesTo: 'reject',
    },
    {
      value: 'OFF_TOPIC',
      label: 'Off-topic or wrong service',
      description: 'Not about this service. If it is about another listed service, post it there.',
      icon: 'ri:question-answer-line',
      penalizes: false,
      reportable: false,
      requiresDetails: false,
      appliesTo: 'reject',
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
      appliesTo: 'both',
    },
    {
      value: 'PROOF_INVALID',
      label: 'Proof missing or invalid',
      description:
        'The order ID was not found, belongs to another service, or does not show the experience. Post again with valid proof.',
      icon: 'ri:file-warning-line',
      penalizes: false,
      reportable: false,
      requiresDetails: false,
      appliesTo: 'reject',
    },
    {
      value: 'BELONGS_ELSEWHERE',
      label: 'Belongs elsewhere',
      description:
        'A question for the service, a listing correction or a message for us. Use their support, a suggestion or the contact page.',
      icon: 'ri:direction-line',
      penalizes: false,
      reportable: false,
      requiresDetails: false,
      appliesTo: 'reject',
    },
    {
      value: 'REPORT_HANDLED',
      label: 'Report handled',
      description: 'We acted on what the comment reported, for example by updating the listing.',
      icon: 'ri:checkbox-circle-line',
      penalizes: false,
      reportable: false,
      requiresDetails: false,
      appliesTo: 'reject',
    },
    {
      value: 'AWAITING_PROOF',
      label: 'Awaiting proof',
      description: 'Waiting for the author to send proof.',
      icon: 'ri:hourglass-line',
      penalizes: false,
      reportable: false,
      requiresDetails: false,
      appliesTo: 'hold',
    },
    {
      value: 'CHECKING_CLAIM',
      label: 'Checking the claim',
      description: 'We are verifying it with the service or testing it ourselves.',
      icon: 'ri:search-eye-line',
      penalizes: false,
      reportable: false,
      requiresDetails: false,
      appliesTo: 'hold',
    },
    {
      value: 'LISTING_CHECK',
      label: 'Listing check needed',
      description:
        'It reports a change to the service, such as an outage or a new policy, that we need to verify.',
      icon: 'ri:list-check-3',
      penalizes: false,
      reportable: false,
      requiresDetails: false,
      appliesTo: 'hold',
    },
    {
      value: 'OTHER',
      label: 'Other',
      description: 'Explain in the details.',
      icon: 'ri:more-line',
      penalizes: false,
      reportable: false,
      requiresDetails: true,
      appliesTo: 'both',
    },
  ] as const satisfies CommentRuleInfo<CommentRule>[]
)

export const reportableCommentRules = commentRules.filter((rule) => rule.reportable)

type _ExpectAllRules = Assert<Equals<(typeof commentRules)[number]['value'], CommentRule>>
