import { z } from 'astro/zod'

import { prisma } from './prisma'

import type { Prisma, RatingMuteReason } from '@prisma/client'

export const MAX_COMMENT_DEPTH = 12

// Spam-class mutes are the only ones that sink to the bottom of a thread.
// Other mute reasons (affiliated, low trust, COI, mod discretion) just take
// the rating out of the score; the comment keeps its chronological slot.
const SPAM_REASONS = new Set<RatingMuteReason>(['SUSPICIOUS_PATTERN', 'TEMPLATE_SPAM'])

export function sinkSpamToBottom<
  T extends {
    ratingMuted: boolean
    ratingMuteReason: RatingMuteReason | null
    replies?: T[]
  },
>(comments: T[]): T[] {
  const withSortedReplies = comments.map((c) =>
    c.replies?.length ? { ...c, replies: sinkSpamToBottom(c.replies) } : c
  )
  const kept: T[] = []
  const sunk: T[] = []
  for (const c of withSortedReplies) {
    if (c.ratingMuted && c.ratingMuteReason && SPAM_REASONS.has(c.ratingMuteReason)) {
      sunk.push(c)
    } else {
      kept.push(c)
    }
  }
  return [...kept, ...sunk]
}

/**
 * Fields every rendering of a comment needs. Exported so a listing outside a
 * service thread can select the same shape and reuse the same components.
 */
export const commentReplyQuery = {
  select: {
    id: true,
    status: true,
    ratingMuted: true,
    ratingMuteReason: true,
    upvotes: true,
    humanAction: true,
    aiAction: true,
    createdAt: true,
    publicNote: true,
    adminNote: true,
    authorNote: true,
    content: true,
    serviceId: true,
    parentId: true,
    rating: true,
    ratingActive: true,
    ratingWeight: true,
    ratingTrustLabel: true,
    ratingTrustReason: true,
    privateProof: true,
    privateProofStatus: true,
    issues: true,
    aiDecidedAt: true,
    aiQuality: true,
    aiIsSpam: true,
    aiIsBrigade: true,
    aiBrigadeConfidence: true,
    aiReasoning: true,
    humanDecidedAt: true,
    humanReasoning: true,
    humanDecidedBy: {
      select: {
        id: true,
        name: true,
        displayName: true,
        picture: true,
      },
    },

    author: {
      select: {
        id: true,
        name: true,
        verified: true,
        admin: true,
        capabilities: true,
        createdAt: true,
        lastLoginAt: true,
        displayName: true,
        picture: true,
        totalKarma: true,
        spammer: true,
        verifiedLink: true,

        _count: {
          select: {
            comments: true,
          },
        },

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
  orderBy: [{ createdAt: 'desc' }],
} as const satisfies Prisma.CommentFindManyArgs

/**
 * A comment listed outside its service thread, which has to name the service it
 * belongs to.
 *
 * Spelled out rather than spread from the thread query, which also carries the
 * moderation record: notes written for moderators, the reasoning behind a
 * verdict, the text of a private proof, and who voted which way. The thread is
 * one service behind a moderator's screen; this feed is every service, public
 * and crawled, so it loads what it draws and nothing else.
 */
export const commentFeedSelect = {
  id: true,
  content: true,
  createdAt: true,
  status: true,
  rating: true,
  upvotes: true,
  issues: true,
  parentId: true,
  privateProofStatus: true,
  ratingMuted: true,
  ratingMuteReason: true,
  ratingTrustLabel: true,
  ratingTrustReason: true,
  ratingWeight: true,
  // Whether a proof exists, never the proof itself: it is an order id a reader
  // handed us to show a moderator, and the badge only reflects its verdict.
  privateProof: true,
  author: {
    select: {
      name: true,
      displayName: true,
      picture: true,
      totalKarma: true,
      verified: true,
      admin: true,
      spammer: true,
      createdAt: true,
      // Read by userCan, which the badges call to mark a moderator. Public by
      // design: the badge it draws is shown to everyone.
      capabilities: true,
      _count: { select: { comments: true } },
      serviceAffiliations: {
        select: { role: true, service: { select: { name: true, slug: true } } },
      },
    },
  },
  service: {
    select: {
      name: true,
      slug: true,
      imageUrl: true,
      verificationStatus: true,
    },
  },
  _count: { select: { replies: true } },
} satisfies Prisma.CommentSelect

export type CommentForFeed = Prisma.CommentGetPayload<{ select: typeof commentFeedSelect }>

export type CommentWithReplies<T extends Record<string, unknown> = Record<never, never>> =
  Prisma.CommentGetPayload<typeof commentReplyQuery> &
    T & {
      replies?: CommentWithReplies<T>[]
    }

export type CommentWithRepliesPopulated = CommentWithReplies<{
  isWatchingReplies: boolean
}>

export const commentSortSchema = z
  .enum(['newest', 'upvotes', 'lowest-rating', 'highest-rating', 'trusted', 'status'])
  .default('newest')
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
      orderByClause.push({ upvotes: 'desc' }, { createdAt: 'desc' })
      break
    case 'lowest-rating':
      orderByClause.push({ rating: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' })
      break
    case 'highest-rating':
      orderByClause.push({ rating: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' })
      break
    case 'trusted':
      orderByClause.push(
        { ratingWeight: 'desc' },
        { ratingActive: 'desc' },
        { upvotes: 'desc' },
        { createdAt: 'desc' }
      )
      break
    case 'status':
      orderByClause.push({ status: 'asc' }, { createdAt: 'desc' })
      break
    case 'newest':
    default:
      orderByClause.push({ createdAt: 'desc' })
      break
  }
  // No DB-level sink: only spam-class mutes go to the bottom, and that
  // decision lives in sinkSpamToBottom which the caller runs over the
  // populated tree. Non-spam mutes stay in their natural chronological
  // slot (the strikethrough on the score conveys "doesn't count").

  const highlightedBranchIds = highlightedCommentId ? await findAllParentIds(highlightedCommentId, depth) : []

  const baseQuery = {
    ...commentReplyQuery,
    orderBy: orderByClause,
    where: {
      OR: [
        ...(user ? [{ authorId: user.id } as const satisfies Prisma.CommentWhereInput] : []),
        showPending
          ? ({
              status: { in: ['APPROVED', 'VERIFIED', 'PENDING'] },
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

/**
 * What the badge components read off a comment.
 *
 * Named rather than taken from either query, because the feed and a service's
 * own thread select different shapes and both draw the same badges. Typing the
 * badges by the fuller of the two would oblige the feed to load fields it never
 * renders.
 */
export type CommentBadgeFields = Pick<
  CommentForFeed,
  | 'author'
  | 'issues'
  | 'parentId'
  | 'privateProof'
  | 'privateProofStatus'
  | 'rating'
  | 'ratingMuted'
  | 'ratingMuteReason'
  | 'ratingTrustLabel'
  | 'ratingTrustReason'
  | 'ratingWeight'
  | 'status'
>
