import { z } from 'astro/zod'

import { prisma } from './prisma'

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
        moderator: true,
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

export async function makeCommentsNestedQuery({
  depth = 0,
  user,
  showPending,
  serviceId,
  sort,
  highlightedCommentId,
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
  highlightedCommentId?: number | null
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

  const highlightedBranchIds = highlightedCommentId ? await findAllParentIds(highlightedCommentId, depth) : []

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
        ...(highlightedBranchIds.length > 0
          ? [{ id: { in: highlightedBranchIds } } as const satisfies Prisma.CommentWhereInput]
          : []),
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

async function findAllParentIds(commentId: number, depth: number) {
  const commentwithManyParents = await prisma.comment.findFirst({
    where: { id: commentId },
    select: makeParentQuerySelect(depth),
  })

  return extractParentIds(commentwithManyParents, [commentId])
}

type ParentQueryRecursive = {
  parent: {
    select: {
      id: true
      parent: false | { select: ParentQueryRecursive }
    }
  }
}

function makeParentQuerySelect(depth: number): ParentQueryRecursive {
  return {
    parent: {
      select: {
        id: true,
        parent: depth <= 0 ? false : { select: makeParentQuerySelect(depth - 1) },
      },
    },
  } as const satisfies Prisma.CommentSelect
}

function extractParentIds(
  comment: Prisma.CommentGetPayload<{ select: ParentQueryRecursive }> | null,
  acc: number[] = []
) {
  if (!comment?.parent?.id) return acc

  return extractParentIds(comment.parent as Prisma.CommentGetPayload<{ select: ParentQueryRecursive }>, [
    ...acc,
    comment.parent.id,
  ])
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
