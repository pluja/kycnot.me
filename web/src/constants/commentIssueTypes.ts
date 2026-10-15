import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'

import type { Assert } from '../lib/assert'
import type { CommentIssueType } from '@prisma/client'
import type { Equals } from 'ts-toolbelt/out/Any/Equals'

type CommentIssueTypeInfo<T extends string | null | undefined = string> = {
  value: T
  formLabel: string
  postLabel: string
  filterLabel: string
  // filterPhrase ends a heading such as "Latest comments about X …".
  filterPhrase: string
  icon: string
  // ongoingIconClass marks a problem a reader should weigh before sending money while it is unresolved.
  ongoingIconClass: string
  // requiresProof marks a claim a post can only make with an order ID or a screenshot attached.
  requiresProof: boolean
}

export const {
  dataArray: commentIssueTypes,
  getFn: getCommentIssueTypeInfo,
  zodEnumById: commentIssueTypesZodEnumByValue,
} = makeHelpersForOptions(
  'value',
  (value): CommentIssueTypeInfo<typeof value> => ({
    value,
    formLabel: value ?? '',
    postLabel: value ?? '',
    filterLabel: value ?? '',
    filterPhrase: '',
    icon: 'ri:error-warning-line',
    ongoingIconClass: 'text-day-400',
    requiresProof: false,
  }),
  [
    {
      value: 'KYC_REQUESTED',
      formLabel: 'Asked me for KYC',
      postLabel: 'KYC asked',
      requiresProof: true,
      filterLabel: 'KYC asked',
      filterPhrase: 'reporting requested KYC',
      icon: 'ri:user-forbid-line',
      ongoingIconClass: 'text-day-400',
    },
    {
      value: 'FUNDS_BLOCKED',
      formLabel: 'Held or blocked my funds',
      postLabel: 'Funds held',
      requiresProof: true,
      filterLabel: 'Funds blocked',
      filterPhrase: 'reporting blocked funds',
      icon: 'ri:wallet-line',
      ongoingIconClass: 'text-orange-400',
    },
    {
      value: 'OTHER',
      formLabel: 'Other problem',
      postLabel: 'Other problem',
      requiresProof: false,
      filterLabel: 'Other problems',
      filterPhrase: 'reporting other problems',
      icon: 'ri:error-warning-line',
      ongoingIconClass: 'text-day-400',
    },
  ] as const satisfies CommentIssueTypeInfo<CommentIssueType>[]
)

type _ExpectAllIssueTypes = Assert<Equals<(typeof commentIssueTypes)[number]['value'], CommentIssueType>>
