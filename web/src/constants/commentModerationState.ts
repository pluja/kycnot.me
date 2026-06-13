import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { Assert } from '../lib/assert'
import type { TailwindColor } from '../lib/colors'
import type { CommentModerationState } from '@prisma/client'
import type { Equals } from 'ts-toolbelt/out/Any/Equals'

type CommentModerationStateInfo<T extends string | null | undefined = string> = {
  id: T
  icon: string
  label: string
  color: TailwindColor
}

export const {
  dataArray: commentModerationStates,
  dataObject: commentModerationStateById,
  getFn: getCommentModerationStateInfo,
  zodEnumById: commentModerationStateZodEnum,
} = makeHelpersForOptions(
  'id',
  (id): CommentModerationStateInfo<typeof id> => ({
    id,
    icon: 'ri:question-line',
    label: id ? transformCase(id.replace('_', ' '), 'title') : String(id),
    color: 'gray',
  }),
  [
    {
      id: 'AWAITING_AI',
      icon: 'ri:robot-2-line',
      label: 'Awaiting AI',
      color: 'gray',
    },
    {
      id: 'AWAITING_HUMAN',
      icon: 'ri:shield-user-line',
      label: 'Needs human',
      color: 'yellow',
    },
    {
      id: 'RESOLVED',
      icon: 'ri:check-double-line',
      label: 'Resolved',
      color: 'green',
    },
  ] as const satisfies CommentModerationStateInfo<CommentModerationState>[]
)

type _ExpectToHaveAllValues = Assert<
  Equals<(typeof commentModerationStates)[number]['id'], CommentModerationState>
>
