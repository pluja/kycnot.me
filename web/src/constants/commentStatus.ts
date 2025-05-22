import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type BadgeSmall from '../components/BadgeSmall.astro'
import type { CommentStatus } from '@prisma/client'
import type { ComponentProps } from 'astro/types'

type CommentStatusInfo<T extends string | null | undefined = string> = {
  id: T
  icon: string
  label: string
  color: ComponentProps<typeof BadgeSmall>['color']
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
    color: 'gray',
    creativeWorkStatus: undefined,
  }),
  [
    {
      id: 'PENDING',
      icon: 'ri:question-line',
      label: 'Unmoderated',
      color: 'yellow',
      creativeWorkStatus: 'Deleted',
    },
    {
      id: 'HUMAN_PENDING',
      icon: 'ri:question-line',
      label: 'Unmoderated',
      color: 'yellow',
      creativeWorkStatus: 'Deleted',
    },
    {
      id: 'VERIFIED',
      icon: 'ri:verified-badge-fill',
      label: 'Verified',
      color: 'blue',
      creativeWorkStatus: 'Verified',
    },
    {
      id: 'REJECTED',
      icon: 'ri:close-line',
      label: 'Rejected',
      color: 'red',
      creativeWorkStatus: 'Deleted',
    },
    {
      id: 'APPROVED',
      icon: 'ri:check-line',
      label: 'Approved',
      color: 'green',
      creativeWorkStatus: 'Active',
    },
  ] as const satisfies CommentStatusInfo<CommentStatus>[]
)
