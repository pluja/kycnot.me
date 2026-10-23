import { filterExperienceIds, publicExperienceSelect, publicEvidenceSelect } from './experienceQueries'
import { canReadComment, publishedCommentStatuses, withdrawnPlaceholderWhere } from './experiences'
import { prisma } from './prisma'

import type { ModeratorResolution } from './experienceQueries'
import type { TrustFacts } from './trust'
import type { CommentIssueType, ExperienceSentiment, Prisma, ServiceUserRole } from '@prisma/client'

const commentThreadSelect = {
  id: true,
  authorId: true,
  kind: true,
  experience: { select: publicExperienceSelect },
  experienceUpdate: { select: { id: true, outcome: true, sentiment: true } },
  evidence: { select: publicEvidenceSelect },
  proofRequests: {
    where: { cancelledAt: null },
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { source: true, message: true, createdAt: true, dueAt: true },
  },
  sourceCases: {
    where: { status: { in: ['OPEN', 'RESOLVED', 'DISPUTED'] } },
    select: { publicId: true, title: true },
  },
  status: true,
  createdAt: true,
  version: true,
  revisions: {
    where: { status: { in: publishedCommentStatuses } },
    orderBy: [{ decidedAt: 'desc' }, { id: 'desc' }],
    take: 1,
    select: { decidedAt: true, createdAt: true },
  },
  publicNote: true,
  content: true,
  serviceId: true,
  parentId: true,
  withdrawnAt: true,
  statusBeforeWithdrawal: true,
  replyTargetDeleted: true,
  replyTo: {
    select: {
      id: true,
      authorId: true,
      status: true,
      author: { select: { name: true, displayName: true } },
    },
  },
  issues: true,

  author: {
    select: {
      id: true,
      name: true,
      verified: true,
      admin: true,
      capabilities: true,
      createdAt: true,
      displayName: true,
      picture: true,

      _count: {
        select: {
          comments: { where: { status: { in: publishedCommentStatuses } } },
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
} as const satisfies Prisma.CommentSelect

export const commentFeedSelect = {
  id: true,
  content: true,
  createdAt: true,
  status: true,
  issues: true,
  parentId: true,
  author: {
    select: {
      name: true,
      displayName: true,
      picture: true,
      verified: true,
      admin: true,
      createdAt: true,
      // Read by userCan, which the badges call to mark a moderator. Public by
      // design: the badge it draws is shown to everyone.
      capabilities: true,
      _count: { select: { comments: { where: { status: { in: publishedCommentStatuses } } } } },
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
  _count: { select: { replies: { where: { status: { in: publishedCommentStatuses } } } } },
} satisfies Prisma.CommentSelect

export type CommentForFeed = Prisma.CommentGetPayload<{ select: typeof commentFeedSelect }>

export type ThreadComment = Prisma.CommentGetPayload<{ select: typeof commentThreadSelect }> & {
  isWatchingReplies: boolean
  authorTrust?: TrustFacts | null
  resolution?: ModeratorResolution | null
}

export const commentTools = ['edit', 'report', 'history', 'evidence', 'reply'] as const
export type CommentTool = (typeof commentTools)[number]

// makeCommentUrl links into the service thread: `comment` makes the server
// open the thread holding the comment, `tool` opens one of its inline panels.
// Tools land on the post itself so it stays in view above its open panel; the
// reply form sits at the end of the thread, so replies land there.
export function makeCommentUrl({
  serviceSlug,
  commentId,
  origin = '',
  tool,
  section,
}: {
  serviceSlug: string
  commentId: number
  origin?: string
  tool?: CommentTool
  section?: string
}) {
  const params = new URLSearchParams({ comment: commentId.toString() })
  if (tool) params.set('tool', tool)
  if (section) params.set('section', section)
  const anchor = tool === 'reply' ? 'reply-form' : `comment-${commentId.toString()}`
  return `${origin}/service/${serviceSlug}?${params.toString()}#${anchor}`
}

export type CommentBadgeFields = {
  createdAt: Date
  parentId: number | null
  author: {
    admin: boolean
    capabilities: string[]
    createdAt: Date
    _count: { comments: number }
    serviceAffiliations: {
      role: ServiceUserRole
      service: { name: string; slug: string }
    }[]
  } | null
}

const holdReasonShortLabels: [RegExp, string][] = [
  [/^spam flag/, 'spam flag'],
  [/^strict commenting$/, 'strict mode'],
  [/^(proof awaiting a moderator check|private proof present)$/, 'proof check'],
  [/^update changes the experience verdict$/, 'verdict change'],
  [/^brigade confidence/, 'coordinated posting'],
  [/^author's posting is disabled$/, 'posting disabled'],
  [/^author has recent penalized rejections$/, 'untrusted author'],
  [/^claim awaiting a proof check$/, 'claim needs proof'],
  [/^order ID used on another post$/, 'reused order ID'],
  [/^order ID does not match the service format$/, 'order ID format'],
  [/^wave of new-account posts$/, 'new-account wave'],
  [/^text looks generated or templated$/, 'generated text'],
]

// holdReasonLabels shortens the worker's hard gate reasons for display; unknown ones pass through.
export const holdReasonLabels = (hardGateReason: string) => [
  ...new Set(
    hardGateReason
      .split(', ')
      .map((reason) => holdReasonShortLabels.find(([pattern]) => pattern.test(reason))?.[1] ?? reason)
  ),
]

export const THREAD_PAGE_SIZE = 50
export const LIST_PAGE_SIZE = 20

// commentVisibilityWhere limits what a viewer loads: restricted services show only the viewer's own
// posts to non-moderators, moderators opening a thread see everything, and otherwise published posts
// plus the viewer's own.
export function commentVisibilityWhere({
  restrictedService,
  canModerate,
  viewerId,
  focused,
}: {
  restrictedService: boolean
  canModerate: boolean
  viewerId: number | undefined
  focused: boolean
}): Prisma.CommentWhereInput {
  if (restrictedService && !canModerate) return { authorId: viewerId ?? -1 }
  if (canModerate && focused) return {}
  return {
    OR: [
      { status: { in: publishedCommentStatuses } },
      withdrawnPlaceholderWhere,
      ...(viewerId ? [{ authorId: viewerId }] : []),
    ],
  }
}

type CommentLoadQuery = {
  serviceId: number
  viewer: Parameters<typeof canReadComment>[0]
  canModerate: boolean
  visibleWhere: Prisma.CommentWhereInput
}

// loadCommentThread loads a thread around one post. With pageFromTarget, the reply page is the one
// holding the target, so a permalink to a late reply opens where that reply is.
export async function loadCommentThread({
  serviceId,
  viewer,
  canModerate,
  visibleWhere,
  commentId,
  page: requestedPage,
  pageFromTarget,
}: CommentLoadQuery & { commentId: number; page: number; pageFromTarget: boolean }) {
  const empty = { comments: [], count: 0, focused: true, page: 1 }
  const target = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true, serviceId: true, authorId: true, status: true, parentId: true, createdAt: true },
  })
  if (target?.serviceId !== serviceId) return empty
  const readable = canReadComment(viewer, target, canModerate)
  const placeholderTarget =
    !readable && (await prisma.comment.count({ where: { id: target.id, ...withdrawnPlaceholderWhere } })) > 0
  if (!readable && !placeholderTarget) return empty
  const rootId = target.parentId ?? target.id
  const replyWhere: Prisma.CommentWhereInput = { ...visibleWhere, parentId: rootId }
  const [root, count, repliesBefore] = await Promise.all([
    prisma.comment.findFirst({ select: commentThreadSelect, where: { ...visibleWhere, id: rootId } }),
    prisma.comment.count({ where: replyWhere }),
    target.parentId && pageFromTarget
      ? prisma.comment.count({
          where: {
            AND: [
              replyWhere,
              {
                OR: [
                  { createdAt: { lt: target.createdAt } },
                  { createdAt: target.createdAt, id: { lt: target.id } },
                ],
              },
            ],
          },
        })
      : Promise.resolve(null),
  ])
  if (!root) return empty
  const page = repliesBefore === null ? requestedPage : Math.floor(repliesBefore / THREAD_PAGE_SIZE) + 1
  const replies = await prisma.comment.findMany({
    select: commentThreadSelect,
    where: replyWhere,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    skip: (page - 1) * THREAD_PAGE_SIZE,
    take: THREAD_PAGE_SIZE,
  })
  return { comments: [root, ...replies], count, focused: true, page }
}

export async function loadCommentList({
  serviceId,
  viewer,
  visibleWhere,
  page,
  filters,
}: CommentLoadQuery & {
  page: number
  filters: {
    search?: string
    sentiment?: ExperienceSentiment
    problem?: CommentIssueType | 'any'
    evidence?: 'checked' | 'unproven'
    period?: '90d'
  }
}) {
  const matched =
    filters.sentiment || filters.evidence || filters.problem || filters.period
      ? await filterExperienceIds(serviceId, {
          sentiment: filters.sentiment,
          problem: filters.problem,
          proof: filters.evidence,
          recent: !!filters.period,
        })
      : null
  const where: Prisma.CommentWhereInput = {
    ...visibleWhere,
    serviceId,
    parentId: null,
    ...(filters.search ? { content: { contains: filters.search, mode: 'insensitive' } } : {}),
    ...(matched ? { id: { in: matched.map((item) => item.id) } } : {}),
    // Matching a search or filter would reveal what a withdrawn post said, so only its author sees it here.
    ...(filters.search || matched
      ? { AND: [{ OR: [{ status: { not: 'WITHDRAWN' } }, ...(viewer ? [{ authorId: viewer.id }] : [])] }] }
      : {}),
  }
  const [count, comments] = await Promise.all([
    prisma.comment.count({ where }),
    prisma.comment.findMany({
      select: commentThreadSelect,
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * LIST_PAGE_SIZE,
      take: LIST_PAGE_SIZE,
    }),
  ])
  return { comments, count, focused: false, page }
}
