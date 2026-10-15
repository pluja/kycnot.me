import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { Assert } from '../lib/assert'
import type { TailwindColor } from '../lib/colors'
import type { CommentStatus } from '@prisma/client'
import type { Equals } from 'ts-toolbelt/out/Any/Equals'

type CommentStatusInfo<T extends string | null | undefined = string> = {
  id: T
  icon: string
  label: string
  // What authors and readers are told, where label is the moderators' wording.
  publicLabel: string
  color: TailwindColor
  creativeWorkStatus: string | undefined
}

export const {
  dataArray: commentStatus,
  dataObject: commentStatusById,
  getFn: getCommentStatusInfo,
} = makeHelpersForOptions(
  'id',
  (id): CommentStatusInfo<typeof id> => ({
    id,
    icon: 'ri:question-line',
    label: id ? transformCase(id, 'title') : String(id),
    publicLabel: id ? transformCase(id, 'title') : String(id),
    color: 'gray',
    creativeWorkStatus: undefined,
  }),
  [
    {
      id: 'PENDING',
      icon: 'ri:question-line',
      label: 'Unmoderated',
      publicLabel: 'Awaiting review',
      color: 'yellow',
      creativeWorkStatus: 'Deleted',
    },
    {
      id: 'REJECTED',
      icon: 'ri:close-line',
      label: 'Rejected',
      publicLabel: 'Not published',
      color: 'red',
      creativeWorkStatus: 'Deleted',
    },
    {
      id: 'APPROVED',
      icon: 'ri:check-line',
      label: 'Approved',
      publicLabel: 'Published',
      color: 'green',
      creativeWorkStatus: 'Active',
    },
    {
      id: 'WITHDRAWN',
      icon: 'ri:arrow-go-back-line',
      label: 'Withdrawn',
      publicLabel: 'Withdrawn by the author',
      color: 'gray',
      creativeWorkStatus: 'Deleted',
    },
  ] as const satisfies CommentStatusInfo<CommentStatus>[]
)

type _ExpectToHaveAllValues = Assert<Equals<(typeof commentStatus)[number]['id'], CommentStatus>>
