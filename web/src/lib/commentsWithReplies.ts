import { z } from 'zod'

import type { Prisma } from '@prisma/client'

export const MAX_COMMENT_DEPTH = 12

const commentReplyQuery = {
  select: {
    id: true,
    status: true,
    suspicious: true,
    upvotes: true,
    requiresAdminReview: true,
    createdAt: true,
    communityNote: true,
    internalNote: true,
    privateContext: true,
    content: true,
    serviceId: true,
    parentId: true,
    rating: true,
    ratingActive: true,
    orderId: true,
    orderIdStatus: true,
    kycRequested: true,
    fundsBlocked: true,

    author: {
      select: {
        id: true,
        name: true,
        verified: true,
        admin: true,
        verifier: true,
        createdAt: true,
        displayName: true,
        picture: true,
        totalKarma: true,
        spammer: true,
        verifiedLink: true,

        serviceAffiliations: {
          select: {
            role: true,
            service: {
              select: {
                name: true,
                slug: true,
              },
            },
          },
        },
      },
    },
    votes: {
      select: {
        userId: true,
        downvote: true,
      },
    },
  },
  orderBy: [{ suspicious: 'asc' }, { createdAt: 'desc' }],
} as const satisfies Prisma.CommentFindManyArgs

export type CommentWithReplies<T extends Record<string, unknown> = Record<never, never>> =
  Prisma.CommentGetPayload<typeof commentReplyQuery> &
    T & {
      replies?: CommentWithReplies<T>[]
    }

export type CommentWithRepliesPopulated = CommentWithReplies<{
  isWatchingReplies: boolean
}>

export const commentSortSchema = z.enum(['newest', 'upvotes', 'status']).default('newest')
export type CommentSortOption = z.infer<typeof commentSortSchema>

export function makeCommentsNestedQuery({
  depth = 0,
  user,
  showPending,
  serviceId,
  sort,
}: {
  depth?: number
  user: Prisma.UserGetPayload<{
    select: {
      id: true
    }
  }> | null
  showPending?: boolean
  serviceId: number
  sort: CommentSortOption
}) {
  const orderByClause: Prisma.CommentOrderByWithRelationInput[] = []

  switch (sort) {
    case 'upvotes':
      orderByClause.push({ upvotes: 'desc' })
      break
    case 'status':
      orderByClause.push({ status: 'asc' }) // PENDING, APPROVED, VERIFIED, REJECTED
      break
    case 'newest': // Default
    default:
      orderByClause.push({ createdAt: 'desc' })
      break
  }
  orderByClause.unshift({ suspicious: 'asc' }) // Always put suspicious comments last within a sort group

  const baseQuery = {
    ...commentReplyQuery,
    orderBy: orderByClause,
    where: {
      OR: [
        ...(user ? [{ authorId: user.id } as const satisfies Prisma.CommentWhereInput] : []),
        showPending
          ? ({
              status: { in: ['APPROVED', 'VERIFIED', 'PENDING', 'HUMAN_PENDING'] },
            } as const satisfies Prisma.CommentWhereInput)
          : ({
              status: { in: ['APPROVED', 'VERIFIED'] },
            } as const satisfies Prisma.CommentWhereInput),
      ],
      parentId: null,
      serviceId,
    },
  } as const satisfies Prisma.CommentFindManyArgs

  if (depth <= 0) return baseQuery

  return {
    ...baseQuery,
    select: {
      ...baseQuery.select,
      replies: makeRepliesQuery(commentReplyQuery, depth - 1),
    },
  }
}

type RepliesQueryRecursive<T extends Prisma.CommentFindManyArgs> =
  | T
  | (Omit<T, 'select'> & {
      select: Omit<T['select'], 'replies'> & {
        replies: RepliesQueryRecursive<T>
      }
    })

export function makeRepliesQuery<T extends Prisma.CommentFindManyArgs>(
  query: T,
  currentDepth: number
): RepliesQueryRecursive<T> {
  if (currentDepth <= 0) return query

  return {
    ...query,
    select: {
      ...query.select,
      replies: makeRepliesQuery(query, currentDepth - 1),
    },
  }
}

export function makeCommentUrl({
  serviceSlug,
  commentId,
  origin,
}: {
  serviceSlug: string
  commentId: number
  origin: string
}) {
  return `${origin}/service/${serviceSlug}?comment=${commentId.toString()}#comment-${commentId.toString()}` as const
}
