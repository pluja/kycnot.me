import { CommentIssueType, CommentKind, ExperienceOutcome, ExperienceSentiment } from '@prisma/client'
import { z } from 'astro/zod'
import { addHours } from 'date-fns'

import { getCommentIssueTypeInfo } from '../constants/commentIssueTypes'
import { experienceOutcomesByValue } from '../constants/experiences'

import { postContentSchema } from './commentLimits'
import { userCan, type UserForPermissions } from './permissions'
import { formCheckbox } from './zodUtils'

import type { CommentStatus, Prisma, ServiceVisibility } from '@prisma/client'

export const publishedCommentStatuses: CommentStatus[] = ['APPROVED']
export const isPublishedComment = (status: CommentStatus) => publishedCommentStatuses.includes(status)

// withdrawnPlaceholderWhere matches withdrawn posts that leave a public note: any that was ever published, so a
// service collecting withdrawals shows, and any others replied to, so their replies keep their place. A post's
// first published version is saved as an APPROVED revision, which survives going back to review.
export const withdrawnPlaceholderWhere = {
  status: 'WITHDRAWN',
  parentId: null,
  OR: [
    { approvedAt: { not: null } },
    { revisions: { some: { status: 'APPROVED' } } },
    { replies: { some: { status: { in: publishedCommentStatuses } } } },
  ],
} satisfies Prisma.CommentWhereInput

// showsAsPlaceholder is true when the viewer may see that the post existed but not what it said.
export const showsAsPlaceholder = (
  viewer: Viewer,
  comment: { authorId: number | null; status: CommentStatus; parentId: number | null },
  canModerate?: boolean
) => comment.status === 'WITHDRAWN' && !comment.parentId && !canReadComment(viewer, comment, canModerate)

export const isServicePubliclyReadable = (visibility: ServiceVisibility) =>
  visibility === 'PUBLIC' || visibility === 'ARCHIVED' || visibility === 'UNLISTED'

export const classifiedKindSchema = z.enum([CommentKind.EXPERIENCE, CommentKind.DISCUSSION])

export const experienceInput = z.object({
  occurredMonth: z
    .string()
    .trim()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .or(z.literal(''))
    .nullish()
    .refine(
      // The latest month anywhere on Earth (UTC+14), so a new month counts as soon as it starts for the author.
      (value) => !value || value <= addHours(new Date(), 14).toISOString().slice(0, 7),
      'The experience cannot be in the future'
    )
    .transform((value) => value || undefined),
  sentiment: z
    .nativeEnum(ExperienceSentiment)
    .or(z.literal(''))
    .nullish()
    .transform((value) => value || undefined),
  outcome: z.nativeEnum(ExperienceOutcome).default(ExperienceOutcome.UNSPECIFIED),
})

export const revisionInput = experienceInput.extend({
  message: z.string().optional(),
  encTimestamp: z.string().min(1),
  commentId: z.coerce.number().int().positive(),
  version: z.coerce.number().int().positive(),
  content: postContentSchema,
  kind: classifiedKindSchema.default(CommentKind.DISCUSSION),
  issues: z.array(z.nativeEnum(CommentIssueType)).default([]),
  noProblems: formCheckbox,
  resolvedSince: formCheckbox,
})

type Viewer = (UserForPermissions & { id: number }) | null | undefined

// canReadComment takes canModerate as the section-wide moderation right, so staff who represent a service read
// its unpublished posts like anyone else.
export function canReadComment(
  viewer: Viewer,
  comment: { authorId: number | null; status: CommentStatus },
  canModerate = userCan(viewer, 'comments:moderate')
) {
  return isPublishedComment(comment.status) || viewer?.id === comment.authorId || canModerate
}

type ModeratedPost = { authorId: number | null; affiliatedUserIds: number[] }

// canReadEvidence lets the evidence author read it, and comment moderators free of a conflict with the post.
export function canReadEvidence(
  viewer: Viewer,
  evidence: { authorId: number | null; removedAt: Date | null; post?: ModeratedPost }
) {
  if (evidence.removedAt || !viewer) return false
  if (viewer.id === evidence.authorId) return true
  return (
    userCan(viewer, 'comments:moderate') && !(evidence.post && hasModerationConflict(viewer, evidence.post))
  )
}

// hasModerationConflict and conflictedCommentWhere express one rule, for a loaded post and as a query
// filter: staff leave posts about a service they represent and, unless they are admins, their own posts.
export const hasModerationConflict = (user: { id: number; admin: boolean }, post: ModeratedPost) =>
  post.affiliatedUserIds.includes(user.id) || (!user.admin && post.authorId === user.id)

export const conflictedCommentWhere = (user: { id: number; admin: boolean }) =>
  ({
    OR: [
      { service: { affiliatedUsers: { some: { userId: user.id } } } },
      // The explicit not-null keeps posts from deleted accounts: under NOT, a bare equality on NULL drops the row.
      ...(user.admin ? [] : [{ authorId: { equals: user.id, not: null } }]),
    ],
  }) satisfies Prisma.CommentWhereInput

// outcomeForProblems maps the writer's single problems question to the stored outcome.
export function outcomeForProblems(answer: {
  noProblems: boolean
  issues: CommentIssueType[]
  resolved: boolean
}): ExperienceOutcome {
  if (answer.issues.length > 0) {
    return answer.resolved ? ExperienceOutcome.RESOLVED : ExperienceOutcome.ONGOING
  }
  return answer.noProblems ? ExperienceOutcome.NO_ISSUE : ExperienceOutcome.UNSPECIFIED
}

// editedOutcome keeps a post's stored outcome when an edit leaves the problems answer as it was. Older posts
// carry problem tags without an outcome, and fixing a typo must not turn their claim into "ongoing".
export function editedOutcome(
  current: { issues: CommentIssueType[]; outcome: ExperienceOutcome },
  answer: { noProblems: boolean; issues: CommentIssueType[]; resolved: boolean }
): ExperienceOutcome {
  const sameTags =
    answer.issues.length === current.issues.length &&
    answer.issues.every((issue) => current.issues.includes(issue))
  const unchanged =
    sameTags &&
    answer.resolved === (current.outcome === ExperienceOutcome.RESOLVED) &&
    answer.noProblems === (current.outcome === ExperienceOutcome.NO_ISSUE)
  return unchanged ? current.outcome : outcomeForProblems(answer)
}

// outcomeLabel is what readers see for the outcome of a post that names no problem.
export function outcomeLabel(outcome: ExperienceOutcome) {
  return outcome === ExperienceOutcome.UNSPECIFIED ? null : experienceOutcomesByValue[outcome].label
}

// problemStatus is null for older posts that tagged a problem without saying how it ended.
export function problemStatus(outcome: ExperienceOutcome) {
  if (outcome === ExperienceOutcome.RESOLVED) return 'resolved'
  if (outcome === ExperienceOutcome.ONGOING) return 'ongoing'
  return null
}

export const issuesNeedingProof = (issues: CommentIssueType[]) =>
  issues.filter((issue) => getCommentIssueTypeInfo(issue).requiresProof)

export const proofRequiredMessage =
  'Reporting a KYC request or held funds needs proof: add your order ID or a screenshot.'
