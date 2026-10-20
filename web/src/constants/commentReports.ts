import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'

import type { Assert } from '../lib/assert'
import type { CommentReportOutcome } from '@prisma/client'
import type { Equals } from 'ts-toolbelt/out/Any/Equals'

type CommentReportOutcomeInfo<T extends string | null | undefined = string> = {
  value: T
  label: string
  icon: string
  color: 'green' | 'slate'
  // moderatorChoice is false for outcomes the system sets on its own.
  moderatorChoice: boolean
}

export const {
  dataArray: commentReportOutcomes,
  getFn: getCommentReportOutcomeInfo,
  zodEnumById: commentReportOutcomesZodEnumByValue,
} = makeHelpersForOptions(
  'value',
  (value): CommentReportOutcomeInfo<typeof value> => ({
    value,
    label: value ?? '',
    icon: 'ri:flag-line',
    color: 'slate',
    moderatorChoice: false,
  }),
  [
    {
      value: 'ACTION_TAKEN',
      label: 'Action taken',
      icon: 'ri:checkbox-circle-line',
      color: 'green',
      moderatorChoice: true,
    },
    {
      value: 'NO_ACTION',
      label: 'No action',
      icon: 'ri:close-circle-line',
      color: 'slate',
      moderatorChoice: true,
    },
    {
      value: 'WITHDRAWN',
      label: 'Comment withdrawn',
      icon: 'ri:arrow-go-back-line',
      color: 'slate',
      moderatorChoice: false,
    },
  ] as const satisfies CommentReportOutcomeInfo<CommentReportOutcome>[]
)

type _ExpectAllOutcomes = Assert<
  Equals<(typeof commentReportOutcomes)[number]['value'], CommentReportOutcome>
>
