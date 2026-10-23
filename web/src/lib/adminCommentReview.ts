import { getVerificationStatusInfo } from '../constants/verificationStatus'

import type { CommentRule, Prisma } from '@prisma/client'

export const adminCommentReviewSelect = {
  id: true,
  content: true,
  issues: true,
  status: true,
  kind: true,
  createdAt: true,
  publicNote: true,
  moderationState: true,
  aiAction: true,
  aiQuality: true,
  aiIsSpam: true,
  aiIsBrigade: true,
  aiBrigadeConfidence: true,
  aiReasoning: true,
  aiSignals: true,
  humanDecisionReason: true,
  humanReasoning: true,
  humanDecidedAt: true,
  authorNote: true,
  adminNote: true,
  author: {
    select: {
      id: true,
      name: true,
      displayName: true,
      picture: true,
      createdAt: true,
      lastLoginAt: true,
      spammer: true,
      verified: true,
      serviceAffiliations: { select: { role: true, service: { select: { id: true, name: true } } } },
      _count: { select: { comments: true } },
    },
  },
  parent: { select: { id: true, content: true, author: { select: { name: true, displayName: true } } } },
  replyTo: { select: { id: true, content: true, author: { select: { name: true } } } },
  service: {
    select: {
      id: true,
      name: true,
      slug: true,
      verificationStatus: true,
      affiliatedUsers: { select: { userId: true } },
    },
  },
  experience: { select: { sentiment: true, outcome: true } },
  revisions: {
    where: { status: 'PENDING' },
    select: { content: true, kind: true, experienceData: true, aiDecidedAt: true, createdAt: true },
  },
  contactThreads: {
    where: { category: 'COMMENT_REPORT', status: { not: 'RESOLVED' } },
    select: { id: true, reportReason: true, fromService: true },
    orderBy: { createdAt: 'asc' },
    take: 20,
  },
  _count: {
    select: {
      evidence: { where: { needsCheck: true, removedAt: null } },
    },
  },
} as const satisfies Prisma.CommentSelect

export type AdminCommentReview = Prisma.CommentGetPayload<{ select: typeof adminCommentReviewSelect }>

// proofsToCheck counts a post's proof waiting for a check; a withdrawn post's proof waits until it is restored.
export const proofsToCheck = (comment: Pick<AdminCommentReview, '_count' | 'status'>) =>
  comment.status === 'WITHDRAWN' ? 0 : comment._count.evidence

export const aiGraceHours = 3
export const aiGraceCutoff = (now = new Date()) => new Date(now.getTime() - aiGraceHours * 60 * 60 * 1000)

// moderatorTodoReasons are the reasons a post needs a moderator. "To do" lists a post once if any applies.
// Posts and edits wait for the AI first, unless it held them or has not answered within the grace period.
export const moderatorTodoReasons = (now = new Date()) => {
  const graceCutoff = aiGraceCutoff(now)
  return {
    posts: {
      OR: [
        // A held post whose author was asked for proof waits for the answer or the due date.
        {
          moderationState: 'AWAITING_HUMAN',
          NOT: { proofRequests: { some: { cancelledAt: null, dueAt: { gt: now } } } },
        },
        { moderationState: 'AWAITING_AI', createdAt: { lt: graceCutoff } },
      ],
    },
    // Proof the old system never reviewed waits in its own list, oldProofWhere, unless its post is held. Proof on a
    // rejected post has nothing left to decide.
    proof: {
      status: { not: 'REJECTED' },
      evidence: {
        some: {
          needsCheck: true,
          removedAt: null,
          OR: [{ legacyStatus: null }, { legacyStatus: { not: 'PENDING' } }],
        },
      },
    },
    reports: { contactThreads: { some: { category: 'COMMENT_REPORT', status: { not: 'RESOLVED' } } } },
    edits: {
      revisions: {
        some: {
          status: 'PENDING',
          OR: [{ aiAction: 'HOLD' }, { aiDecidedAt: null, createdAt: { lt: graceCutoff } }],
        },
      },
    },
  } satisfies Record<string, Prisma.CommentWhereInput>
}

// oldProofWhere is the backlog the old system left: proof on published posts that nobody ever reviewed. It gets no
// new entries, so its list empties for good once moderators work through it.
export const oldProofWhere = {
  status: 'APPROVED',
  evidence: { some: { needsCheck: true, removedAt: null, legacyStatus: 'PENDING' } },
} satisfies Prisma.CommentWhereInput

export type TodoReason = keyof ReturnType<typeof moderatorTodoReasons> | 'oldProof'

export const todoRankSelect = {
  id: true,
  createdAt: true,
  aiDecidedAt: true,
  issues: true,
  experience: { select: { sentiment: true } },
  service: { select: { verificationStatus: true } },
  contactThreads: {
    where: { category: 'COMMENT_REPORT', status: { not: 'RESOLVED' } },
    select: { createdAt: true, reportReason: true },
  },
  revisions: { where: { status: 'PENDING' }, select: { createdAt: true } },
  evidence: { where: { needsCheck: true, removedAt: null }, select: { createdAt: true, legacyStatus: true } },
} satisfies Prisma.CommentSelect

type TodoRankPost = Prisma.CommentGetPayload<{ select: typeof todoRankSelect }>

// seriousReportRules can hurt someone for as long as the post stays up, so their reports come first.
const seriousReportRules: CommentRule[] = ['PRIVATE_INFO', 'SCAM_CONTACT', 'SLUR', 'HARASSMENT']

const earliest = (dates: Date[], fallback: Date) =>
  dates.reduce((first, date) => (date < first ? date : first), dates[0] ?? fallback)

// todoRank places a post by its most urgent reason: serious reports, other reports, held posts, held edits, proof on
// posts that report a problem, then other proof. since is when that reason started waiting.
export function todoRank(post: TodoRankPost, reasons: ReadonlySet<TodoReason>) {
  const listed = getVerificationStatusInfo(post.service.verificationStatus).listed
  if (reasons.has('reports')) {
    const serious = post.contactThreads.some(
      (thread) => !!thread.reportReason && seriousReportRules.includes(thread.reportReason)
    )
    return {
      level: serious ? 0 : 1,
      since: earliest(
        post.contactThreads.map((thread) => thread.createdAt),
        post.createdAt
      ),
      listed,
    }
  }
  if (reasons.has('posts')) return { level: 2, since: post.aiDecidedAt ?? post.createdAt, listed }
  if (reasons.has('edits')) {
    return {
      level: 3,
      since: earliest(
        post.revisions.map((revision) => revision.createdAt),
        post.createdAt
      ),
      listed,
    }
  }
  const reportsProblem = post.experience?.sentiment === 'NEGATIVE' || post.issues.length > 0
  // Old proof only dates its own list; in To do the wait starts with the newest kind of proof.
  const oldList = reasons.has('oldProof')
  const waiting = post.evidence.filter((item) => (item.legacyStatus === 'PENDING') === oldList)
  return {
    level: reportsProblem ? 4 : 5,
    since: earliest(
      waiting.map((item) => item.createdAt),
      post.createdAt
    ),
    listed,
  }
}

type TodoRank = ReturnType<typeof todoRank>

export const compareTodo = (a: TodoRank & { id: number }, b: TodoRank & { id: number }) =>
  a.level - b.level ||
  Number(b.listed) - Number(a.listed) ||
  a.since.getTime() - b.since.getTime() ||
  a.id - b.id
