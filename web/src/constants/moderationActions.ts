import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'

import type { Assert } from '../lib/assert'
import type { ModerationAction } from '@prisma/client'
import type { Equals } from 'ts-toolbelt/out/Any/Equals'

type ModerationActionInfo<T extends string | null | undefined = string> = {
  value: T
  // verb is what the action does to the post, as moderators read it next to "AI:".
  verb: string
  className: string
}

export const { dataArray: moderationActions, getFn: getModerationActionInfo } = makeHelpersForOptions(
  'value',
  (value): ModerationActionInfo<typeof value> => ({
    value,
    verb: value ? value.toLowerCase() : '',
    className: 'text-day-300',
  }),
  [
    { value: 'APPROVE', verb: 'publish', className: 'text-green-300' },
    { value: 'REJECT', verb: 'reject', className: 'text-red-300' },
    { value: 'HOLD', verb: 'hold', className: 'text-yellow-300' },
  ] as const satisfies ModerationActionInfo<ModerationAction>[]
)

type _ExpectAllActions = Assert<Equals<(typeof moderationActions)[number]['value'], ModerationAction>>
