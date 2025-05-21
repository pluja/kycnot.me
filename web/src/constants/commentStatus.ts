import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { CommentStatus } from '@prisma/client'

type CommentStatusInfo<T extends string | null | undefined = string> = {
  id: T
  icon: string
  label: string
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
    creativeWorkStatus: undefined,
  }),
  [
    {
      id: 'PENDING',
      icon: 'ri:question-line',
      label: 'Pending',
      creativeWorkStatus: 'Deleted',
    },
    {
      id: 'HUMAN_PENDING',
      icon: 'ri:question-line',
      label: 'Pending',
      creativeWorkStatus: 'Deleted',
    },
    {
      id: 'VERIFIED',
      icon: 'ri:check-line',
      label: 'Verified',
      creativeWorkStatus: 'Verified',
    },
    {
      id: 'REJECTED',
      icon: 'ri:close-line',
      label: 'Rejected',
      creativeWorkStatus: 'Deleted',
    },
    {
      id: 'APPROVED',
      icon: 'ri:check-line',
      label: 'Approved',
      creativeWorkStatus: 'Active',
    },
  ] as const satisfies CommentStatusInfo<CommentStatus>[]
)
