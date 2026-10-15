import type { Prisma } from '@prisma/client'

export const commentPageSelect = {
  id: true,
  authorId: true,
  content: true,
  status: true,
  humanDecidedAt: true,
  kind: true,
  version: true,
  parentId: true,
  publicNote: true,
  issues: true,
  experience: {
    select: {
      occurredMonth: true,
      sentiment: true,
      sentimentSource: true,
      outcome: true,
    },
  },
  experienceUpdate: { select: { id: true } },
  proofRequests: {
    where: { cancelledAt: null },
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { id: true, source: true, message: true, createdAt: true, dueAt: true },
  },
  service: {
    select: {
      id: true,
      name: true,
      slug: true,
      strictCommentingEnabled: true,
      serviceVisibility: true,
      proofLookupUrl: true,
      affiliatedUsers: { select: { userId: true } },
    },
  },
} satisfies Prisma.CommentSelect

export const commentPageEvidenceSelect = {
  id: true,
  createdAt: true,
  removedAt: true,
  legacyStatus: true,
  kind: true,
  formatValid: true,
  needsCheck: true,
  checks: {
    orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
    select: { id: true, finding: true, explanation: true, checkedAt: true },
  },
} satisfies Prisma.CommentEvidenceSelect

// latestCheckSelect loads the check that decides a proof's result: the latest one recorded.
export const latestCheckSelect = {
  orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
  take: 1,
  select: { finding: true },
} satisfies Prisma.CommentEvidence$checksArgs

export const commentPagePrivateEvidenceSelect = {
  id: true,
  authorId: true,
  removedAt: true,
  body: true,
  imagePath: true,
  kind: true,
  normalizedId: true,
  formatValid: true,
  legacyStatus: true,
  checks: latestCheckSelect,
  _count: { select: { checks: true } },
} satisfies Prisma.CommentEvidenceSelect

export const commentPageRevisionSelect = {
  id: true,
  experienceData: true,
  content: true,
  status: true,
  redactedAt: true,
  createdAt: true,
  decidedAt: true,
} satisfies Prisma.CommentRevisionSelect

export type CommentPagePost = Prisma.CommentGetPayload<{ select: typeof commentPageSelect }>
export type CommentPageEvidence = Prisma.CommentEvidenceGetPayload<{
  select: typeof commentPageEvidenceSelect
}>
export type CommentPagePrivateEvidence = Prisma.CommentEvidenceGetPayload<{
  select: typeof commentPagePrivateEvidenceSelect
}>
export type CommentPageRevision = Prisma.CommentRevisionGetPayload<{
  select: typeof commentPageRevisionSelect & {
    reason: true
    decisionRule: true
    aiAction: true
    aiReasoning: true
    baseVersion: true
    kind: true
    experienceData: true
  }
}>

export function distinctVersions<T extends { content: string }>(
  revisions: T[],
  excludedKey?: string,
  keyOf: (revision: T) => string = (revision) => revision.content
) {
  const seen = new Set(excludedKey === undefined ? [] : [excludedKey])
  return revisions.filter((revision) => {
    const key = keyOf(revision)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// publishedVersionKey tells versions apart by what readers see: the text, the experience label and outcome, and
// the problems it reports.
export const publishedVersionKey = (revision: { content: string; experienceData: unknown }) => {
  const details = versionDetails(revision.experienceData)
  return JSON.stringify([revision.content, details.sentiment, details.outcome, details.issues])
}

export function versionDetails(experienceData: unknown) {
  const data = (
    typeof experienceData === 'object' && experienceData && !Array.isArray(experienceData)
      ? experienceData
      : {}
  ) as Record<string, unknown>
  return {
    sentiment: typeof data.sentiment === 'string' ? data.sentiment : null,
    outcome: typeof data.outcome === 'string' ? data.outcome : null,
    issues: Array.isArray(data.issues) ? data.issues.filter((issue) => typeof issue === 'string').sort() : [],
  }
}
