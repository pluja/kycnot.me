import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import { commentStatusById } from './commentStatus'

import type BadgeSmall from '../components/BadgeSmall.astro'
import type { Prisma } from '@prisma/client'
import type { ComponentProps } from 'astro/types'

type CommentStatusFilterInfo<T extends string | null | undefined = string> = {
  value: T
  label: string
  color: ComponentProps<typeof BadgeSmall>['color']
  icon: string
  whereClause: Prisma.CommentWhereInput
  classNames: {
    filter: string
  }
}

export const {
  dataArray: commentStatusFilters,
  dataObject: commentStatusFiltersById,
  getFn: getCommentStatusFilterInfo,
  zodEnumById: commentStatusFiltersZodEnum,
} = makeHelpersForOptions(
  'value',
  (value): CommentStatusFilterInfo<typeof value> => ({
    value,
    label: value ? transformCase(value, 'title') : String(value),
    whereClause: {},
    color: 'gray',
    icon: 'ri:question-line',
    classNames: {
      filter: 'border-zinc-700 transition-colors hover:border-green-500/50',
    },
  }),
  [
    {
      label: 'All',
      value: 'all',
      whereClause: {},
      color: 'gray',
      icon: 'ri:question-line',
      classNames: {
        filter: 'border-green-500 bg-green-500/20 text-green-400',
      },
    },
    {
      value: 'pending',
      label: commentStatusById.PENDING.label,
      color: commentStatusById.PENDING.color,
      icon: commentStatusById.PENDING.icon,
      whereClause: {
        OR: [{ status: 'PENDING' }, { status: 'HUMAN_PENDING' }],
      },
      classNames: {
        filter: 'border-blue-500 bg-blue-500/20 text-blue-400',
      },
    },
    {
      value: 'human-pending',
      label: commentStatusById.HUMAN_PENDING.label,
      color: commentStatusById.HUMAN_PENDING.color,
      icon: commentStatusById.HUMAN_PENDING.icon,
      whereClause: { status: 'HUMAN_PENDING' },
      classNames: {
        filter: 'border-blue-500 bg-blue-500/20 text-blue-400',
      },
    },
    {
      value: 'rejected',
      label: commentStatusById.REJECTED.label,
      color: commentStatusById.REJECTED.color,
      icon: commentStatusById.REJECTED.icon,
      whereClause: {
        status: 'REJECTED',
      },
      classNames: {
        filter: 'border-red-500 bg-red-500/20 text-red-400',
      },
    },
    {
      label: 'Suspicious',
      value: 'suspicious',
      color: 'red',
      icon: 'ri:close-circle-fill',
      whereClause: {
        suspicious: true,
      },
      classNames: {
        filter: 'border-red-500 bg-red-500/20 text-red-400',
      },
    },
    {
      value: 'verified',
      label: commentStatusById.VERIFIED.label,
      color: commentStatusById.VERIFIED.color,
      icon: commentStatusById.VERIFIED.icon,
      whereClause: {
        status: 'VERIFIED',
      },
      classNames: {
        filter: 'border-blue-500 bg-blue-500/20 text-blue-400',
      },
    },
    {
      value: 'approved',
      label: commentStatusById.APPROVED.label,
      color: commentStatusById.APPROVED.color,
      icon: commentStatusById.APPROVED.icon,
      whereClause: {
        status: 'APPROVED',
      },
      classNames: {
        filter: 'border-green-500 bg-green-500/20 text-green-400',
      },
    },
    {
      label: 'Needs Review',
      value: 'needs-review',
      color: 'yellow',
      icon: 'ri:question-line',
      whereClause: {
        requiresAdminReview: true,
      },
      classNames: {
        filter: 'border-yellow-500 bg-yellow-500/20 text-yellow-400',
      },
    },
  ] as const satisfies CommentStatusFilterInfo[]
)

export type CommentStatusFilter = (typeof commentStatusFilters)[number]['value']

export function getCommentStatusFilterValue(
  comment: Prisma.CommentGetPayload<{
    select: {
      status: true
      suspicious: true
      requiresAdminReview: true
    }
  }>
): CommentStatusFilter {
  if (comment.requiresAdminReview) return 'needs-review'
  if (comment.suspicious) return 'suspicious'

  switch (comment.status) {
    case 'PENDING': {
      return 'pending'
    }
    case 'HUMAN_PENDING': {
      return 'human-pending'
    }
    case 'VERIFIED': {
      return 'verified'
    }
    case 'REJECTED': {
      return 'rejected'
    }
    case 'APPROVED': {
      return 'approved'
    }
    default: {
      return 'all'
    }
  }
}
