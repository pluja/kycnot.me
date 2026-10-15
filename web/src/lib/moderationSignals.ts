import { differenceInCalendarDays } from 'date-fns'

import { countOf } from './pluralize'
import { prisma } from './prisma'

import type { AdminCommentReview } from './adminCommentReview'
import type { TailwindColor } from './colors'
import type { CommentStatus } from '@prisma/client'

export type ModerationSignal = { label: string; tone: 'bad' | 'good' | 'warn'; icon: string }
export type AuthorHistory = { rejectedPosts: number; postsOnService: number }

export const signalToneColor = {
  bad: 'red',
  warn: 'yellow',
  good: 'green',
} as const satisfies Record<ModerationSignal['tone'], TailwindColor>

type HistoryPost = {
  id: number
  status: CommentStatus
  author: { id: number } | null
  service: { id: number }
}

// authorHistory loads, in two queries for any number of posts, how often each
// author was rejected and how much they posted on the same service, excluding
// the post under review.
export async function authorHistory(posts: HistoryPost[]) {
  const authorIds = [...new Set(posts.flatMap((post) => (post.author ? [post.author.id] : [])))]
  const [rejected, perService] = authorIds.length
    ? await Promise.all([
        prisma.comment.groupBy({
          by: ['authorId'],
          where: { authorId: { in: authorIds }, status: 'REJECTED' },
          _count: { _all: true },
        }),
        prisma.comment.groupBy({
          by: ['authorId', 'serviceId'],
          where: { authorId: { in: authorIds } },
          _count: { _all: true },
        }),
      ])
    : [[], []]
  return (post: HistoryPost): AuthorHistory => {
    const authorId = post.author?.id
    if (authorId === undefined) return { rejectedPosts: 0, postsOnService: 0 }
    return {
      rejectedPosts:
        (rejected.find((group) => group.authorId === authorId)?._count._all ?? 0) -
        (post.status === 'REJECTED' ? 1 : 0),
      postsOnService:
        (perService.find((group) => group.authorId === authorId && group.serviceId === post.service.id)
          ?._count._all ?? 1) - 1,
    }
  }
}

export function moderationSignals(comment: AdminCommentReview, history: AuthorHistory) {
  const { author } = comment
  const accountAgeDays = author ? differenceInCalendarDays(comment.createdAt, author.createdAt) : null
  const worksForService =
    !!author && comment.service.affiliatedUsers.some((item) => item.userId === author.id)
  const otherServices = (author?.serviceAffiliations ?? []).filter(
    (affiliation) => affiliation.service.id !== comment.service.id
  )
  const signals: (ModerationSignal | false | null | undefined)[] = [
    author?.spammer && { label: 'Posting restricted', tone: 'bad', icon: 'ri:forbid-line' },
    worksForService && { label: 'Works for this service', tone: 'bad', icon: 'ri:building-line' },
    otherServices.length > 0 && {
      label: `Works for ${otherServices.map((affiliation) => affiliation.service.name).join(', ')}`,
      tone: 'warn',
      icon: 'ri:building-line',
    },
    history.rejectedPosts > 0 && {
      label: `${countOf(history.rejectedPosts, 'rejected post', 'rejected posts')} before`,
      tone: 'bad',
      icon: 'ri:close-circle-line',
    },
    !!comment.aiIsSpam && { label: 'AI: possible spam', tone: 'bad', icon: 'ri:robot-2-line' },
    !!comment.aiIsBrigade && {
      label: `AI: coordinated posting${comment.aiBrigadeConfidence !== null ? ` (${comment.aiBrigadeConfidence.toString()}/5)` : ''}`,
      tone: 'bad',
      icon: 'ri:group-line',
    },
    accountAgeDays !== null &&
      accountAgeDays < 14 && {
        label:
          accountAgeDays < 1
            ? 'Account created the same day'
            : `Account ${accountAgeDays.toString()} days old`,
        tone: 'warn',
        icon: 'ri:time-line',
      },
    !!author &&
      author._count.comments <= 1 && { label: 'First post', tone: 'warn', icon: 'ri:user-add-line' },
    author?.verified && { label: 'Verified user', tone: 'good', icon: 'ri:verified-badge-line' },
  ]
  return signals.filter((signal): signal is ModerationSignal => !!signal)
}
