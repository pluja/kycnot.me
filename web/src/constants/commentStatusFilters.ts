import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { Prisma } from '@prisma/client'

type CommentStatusFilterInfo<T extends string | null | undefined = string> = {
  value: T
  label: string
  whereClause: Prisma.CommentWhereInput
  styles: {
    filter: string
    badge: string
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
    styles: {
      filter: 'border-zinc-700 transition-colors hover:border-green-500/50',
      badge: '',
    },
  }),
  [
    {
      label: 'All',
      value: 'all',
      whereClause: {},
      styles: {
        filter: 'border-green-500 bg-green-500/20 text-green-400',
        badge: '',
      },
    },
    {
      label: 'Pending',
      value: 'pending',
      whereClause: {
        OR: [{ status: 'PENDING' }, { status: 'HUMAN_PENDING' }],
      },
      styles: {
        filter: 'border-blue-500 bg-blue-500/20 text-blue-400',
        badge: 'rounded-sm bg-blue-500/20 px-2 py-0.5 text-[12px] font-medium text-blue-500',
      },
    },
    {
      label: 'Human Pending',
      value: 'human-pending',
      whereClause: { status: 'HUMAN_PENDING' },
      styles: {
        filter: 'border-blue-500 bg-blue-500/20 text-blue-400',
        badge: 'rounded-sm bg-blue-500/20 px-2 py-0.5 text-[12px] font-medium text-blue-500',
      },
    },
    {
      label: 'Rejected',
      value: 'rejected',
      whereClause: {
        status: 'REJECTED',
      },
      styles: {
        filter: 'border-red-500 bg-red-500/20 text-red-400',
        badge: 'rounded-sm bg-red-500/20 px-2 py-0.5 text-[12px] font-medium text-red-500',
      },
    },
    {
      label: 'Suspicious',
      value: 'suspicious',
      whereClause: {
        suspicious: true,
      },
      styles: {
        filter: 'border-red-500 bg-red-500/20 text-red-400',
        badge: 'rounded-sm bg-red-500/20 px-2 py-0.5 text-[12px] font-medium text-red-500',
      },
    },
    {
      label: 'Verified',
      value: 'verified',
      whereClause: {
        status: 'VERIFIED',
      },
      styles: {
        filter: 'border-blue-500 bg-blue-500/20 text-blue-400',
        badge: 'rounded-sm bg-blue-500/20 px-2 py-0.5 text-[12px] font-medium text-blue-500',
      },
    },
    {
      label: 'Approved',
      value: 'approved',
      whereClause: {
        status: 'APPROVED',
      },
      styles: {
        filter: 'border-green-500 bg-green-500/20 text-green-400',
        badge: 'rounded-sm bg-green-500/20 px-2 py-0.5 text-[12px] font-medium text-green-500',
      },
    },
    {
      label: 'Needs Review',
      value: 'needs-review',
      whereClause: {
        requiresAdminReview: true,
      },
      styles: {
        filter: 'border-yellow-500 bg-yellow-500/20 text-yellow-400',
        badge: 'rounded-sm bg-yellow-500/20 px-2 py-0.5 text-[12px] font-medium text-yellow-500',
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
