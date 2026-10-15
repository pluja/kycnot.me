import { Prisma, type CommentExperience, type CommentIssueType } from '@prisma/client'

import { countingFindings } from '../constants/experiences'

import { publishedCommentStatuses } from './experiences'
import { prisma } from './prisma'

export const publicExperienceSelect = {
  occurredMonth: true,
  sentiment: true,
  sentimentSource: true,
  outcome: true,
  updates: {
    take: 1,
    where: { comment: { status: { in: publishedCommentStatuses } } },
    orderBy: [{ comment: { approvedAt: 'desc' } }, { commentId: 'desc' }],
    select: {
      outcome: true,
      sentiment: true,
      comment: { select: { id: true, content: true, createdAt: true } },
    },
  },
} satisfies Prisma.CommentExperienceSelect

export const publicEvidenceSelect = {
  id: true,
  removedAt: true,
  kind: true,
  formatValid: true,
  legacyStatus: true,
  needsCheck: true,
  createdAt: true,
  checks: {
    orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
    select: { finding: true, explanation: true, checkedAt: true, recordedAt: true },
    take: 1,
  },
} satisfies Prisma.CommentEvidenceSelect

// acceptedProofSql mirrors proofStatus: evidence counts only through a confirming human check.
const acceptedProofSql = (commentId: Prisma.Sql) => Prisma.sql`EXISTS (
  SELECT 1 FROM "CommentEvidence" proof WHERE proof."commentId"=${commentId} AND proof."removedAt" IS NULL
  AND COALESCE((
    SELECT CASE
      WHEN ch.finding = 'LEGACY' THEN proof."legacyStatus" IS NOT DISTINCT FROM 'APPROVED'
      ELSE ch.finding::text IN (${Prisma.join(countingFindings)})
    END
    FROM "EvidenceCheck" ch WHERE ch."evidenceId"=proof.id ORDER BY ch."recordedAt" DESC, ch.id DESC LIMIT 1
  ), false)
)`

// unprovenSql mirrors proofRequestState in proofRequests.ts: a request past its due date that no proof answered.
const unprovenSql = (commentId: Prisma.Sql) => Prisma.sql`(
  NOT ${acceptedProofSql(commentId)}
  AND EXISTS (
    SELECT 1 FROM "ProofRequest" r
    WHERE r."commentId"=${commentId} AND r."cancelledAt" IS NULL AND r."dueAt" < NOW()
      AND NOT EXISTS (
        SELECT 1 FROM "CommentEvidence" v
        WHERE v."commentId"=${commentId} AND v."removedAt" IS NULL
          AND ((v."needsCheck" AND v."createdAt" <= r."dueAt") OR (
            SELECT ch.finding FROM "EvidenceCheck" ch WHERE ch."evidenceId"=v.id
            ORDER BY ch."recordedAt" DESC, ch.id DESC LIMIT 1
          ) = 'UNABLE_TO_CHECK')
      )
  )
)`

const publishedStatusesSql = Prisma.raw(publishedCommentStatuses.map((status) => `'${status}'`).join(','))

// latestUpdateSql is the sentiment or outcome set by an experience's latest published update, if any.
const latestUpdateSql = (field: 'outcome' | 'sentiment') => Prisma.sql`(
  SELECT u.${Prisma.raw(field)} FROM "ExperienceUpdate" u JOIN "Comment" p ON p.id=u."commentId"
  WHERE u."experienceId"=e.id AND u.${Prisma.raw(field)} IS NOT NULL AND p.status IN (${publishedStatusesSql})
  ORDER BY p."approvedAt" DESC, p.id DESC LIMIT 1)`

// currentVerdictSql is an experience's sentiment or outcome after its latest published update, as text.
const currentVerdictSql = (field: 'outcome' | 'sentiment') =>
  Prisma.sql`COALESCE(${latestUpdateSql(field)}, e.${Prisma.raw(field)})::text`

export const summaryWindowDays = 90

// problemReportedSql matches a post that reports a problem (one type, or any) that it hasn't marked resolved.
const problemReportedSql = (problem: CommentIssueType | 'any') => Prisma.sql`(
  ${currentVerdictSql('outcome')} <> 'RESOLVED'
  AND NOT ${unprovenSql(Prisma.raw('c.id'))}
  AND (${problem}::text = 'any' AND cardinality(c.issues) > 0 OR ${problem}::text = ANY(c.issues::text[]))
)`

export async function filterExperienceIds(
  serviceId: number,
  filters: {
    sentiment?: string
    problem?: CommentIssueType | 'any'
    proof?: 'checked' | 'unproven'
    recent?: boolean
  }
) {
  const { sentiment, problem, proof, recent } = filters
  return prisma.$queryRaw<{ id: number }[]>(Prisma.sql`
    SELECT c.id FROM "Comment" c JOIN "CommentExperience" e ON e."commentId"=c.id
    WHERE c.kind='EXPERIENCE' AND c."serviceId"=${serviceId}
    AND (${sentiment ?? null}::text IS NULL OR ${currentVerdictSql('sentiment')}=${sentiment ?? null})
    AND (${problem ?? null}::text IS NULL OR ${problemReportedSql(problem ?? 'any')})
    AND (${proof ?? null}::text IS NULL OR (${acceptedProofSql(Prisma.raw('c.id'))}) = (${proof ?? null}::text = 'checked'))
    AND (NOT ${recent ?? false} OR c."createdAt" > NOW() - make_interval(days => ${summaryWindowDays}::int))
  `)
}

// experienceFeedPage pages the site-wide feed of published experiences on public services by
// current sentiment in SQL, so a filtered page never loads every matching id.
export async function experienceFeedPage({
  sentiment,
  service,
  issue,
  skip,
  take,
}: {
  sentiment: string
  service?: string
  issue?: string
  skip: number
  take: number
}) {
  const [page] = await prisma.$queryRaw<{ total: number; ids: number[] }[]>(Prisma.sql`
    WITH matching AS (
      SELECT c.id, c."createdAt" FROM "Comment" c
      JOIN "CommentExperience" e ON e."commentId"=c.id
      JOIN "Service" s ON s.id=c."serviceId"
      WHERE c.kind='EXPERIENCE' AND c.status IN (${publishedStatusesSql}) AND s."serviceVisibility"='PUBLIC'
        AND (${service ?? null}::text IS NULL OR s.slug=${service ?? null} OR lower(s.name)=lower(${service ?? null}))
        AND (${issue ?? null}::text IS NULL OR ${issue ?? null}::"CommentIssueType" = ANY(c.issues))
        AND ${currentVerdictSql('sentiment')}=${sentiment}
    )
    SELECT (SELECT count(*) FROM matching)::int AS total,
      ARRAY(SELECT id FROM matching ORDER BY "createdAt" DESC, id DESC OFFSET ${skip} LIMIT ${take}) AS ids
  `)
  return page ?? { total: 0, ids: [] }
}

export async function currentExperienceStates(commentIds: number[]) {
  if (!commentIds.length) return []
  return prisma.$queryRaw<
    Pick<CommentExperience, 'commentId' | 'outcome' | 'sentiment' | 'sentimentSource'>[]
  >(Prisma.sql`
    SELECT e."commentId", ${currentVerdictSql('sentiment')}::"ExperienceSentiment" AS sentiment,
      CASE WHEN ${latestUpdateSql('sentiment')} IS NOT NULL THEN 'AUTHOR'::"SentimentSource" ELSE e."sentimentSource" END AS "sentimentSource",
      ${currentVerdictSql('outcome')}::"ExperienceOutcome" AS outcome
    FROM "CommentExperience" e
    WHERE e."commentId" IN (${Prisma.join(commentIds)})
  `)
}

export type SentimentCounts = { positive: number; neutral: number; negative: number }

// newcomerSql marks an author's first post from an account under a week old. Without checked proof it counts half
// in the verdict, which blunts shilling and brigades alike without hiding anyone.
const newcomerSql = Prisma.sql`(
  c."createdAt" - u."createdAt" < INTERVAL '7 days'
  AND NOT EXISTS (
    SELECT 1 FROM "Comment" earlier
    WHERE earlier."authorId"=c."authorId" AND earlier."parentId" IS NULL AND earlier.kind='EXPERIENCE' AND earlier.id <> c.id
      AND earlier."createdAt" < c."createdAt" AND earlier.status IN (${publishedStatusesSql})
  )
)`
const weightSql = Prisma.sql`CASE WHEN newcomer AND NOT proven THEN 0.5 ELSE 1 END`

// experienceSummary counts the published experiences of the last summaryWindowDays: all of them and the ones with
// checked proof. Withdrawn posts are never published, Unproven ones never count, and an author counts once, by
// their latest post.
export async function experienceSummary(serviceId: number, restrictedAuthorId?: number) {
  const recentExperiences = Prisma.sql`
    SELECT c."createdAt",
      ${currentVerdictSql('sentiment')} AS sentiment,
      ${acceptedProofSql(Prisma.raw('c.id'))} AS proven,
      ${newcomerSql} AS newcomer
    FROM "Comment" c
    JOIN "CommentExperience" e ON e."commentId"=c.id
    LEFT JOIN "User" u ON u.id=c."authorId"
    WHERE c."serviceId"=${serviceId} AND c."parentId" IS NULL AND c.kind='EXPERIENCE'
      AND c.status IN (${publishedStatusesSql})
      AND NOT ${unprovenSql(Prisma.raw('c.id'))}
      AND NOT EXISTS (
        SELECT 1 FROM "Comment" later
        WHERE later."authorId"=c."authorId" AND later."serviceId"=c."serviceId" AND later."parentId" IS NULL
          AND later.kind='EXPERIENCE' AND later.status IN (${publishedStatusesSql})
          AND (later."createdAt", later.id) > (c."createdAt", c.id)
          AND NOT ${unprovenSql(Prisma.raw('later.id'))}
      )
      AND (${restrictedAuthorId ?? null}::int IS NULL OR c."authorId"=${restrictedAuthorId ?? null})`
  const [counts] = await prisma.$queryRaw<
    {
      total: number
      checked: number
      checkedPositive: number
      checkedNeutral: number
      checkedNegative: number
      positive: number
      neutral: number
      negative: number
      weightedPositive: number
      weightedNeutral: number
      weightedNegative: number
      latestAt: Date | null
      recentLatestAt: Date | null
    }[]
  >(Prisma.sql`
      WITH experiences AS (${recentExperiences}),
      recent AS (
        SELECT * FROM experiences WHERE "createdAt" > NOW() - make_interval(days => ${summaryWindowDays}::int)
      )
      SELECT
        (SELECT COUNT(*) FROM recent)::int AS total,
        (SELECT COUNT(*) FROM recent WHERE proven)::int AS checked,
        (SELECT COUNT(*) FROM recent WHERE proven AND sentiment='POSITIVE')::int AS "checkedPositive",
        (SELECT COUNT(*) FROM recent WHERE proven AND sentiment='NEUTRAL')::int AS "checkedNeutral",
        (SELECT COUNT(*) FROM recent WHERE proven AND sentiment='NEGATIVE')::int AS "checkedNegative",
        (SELECT COUNT(*) FROM recent WHERE sentiment='POSITIVE')::int AS positive,
        (SELECT COUNT(*) FROM recent WHERE sentiment='NEUTRAL')::int AS neutral,
        (SELECT COUNT(*) FROM recent WHERE sentiment='NEGATIVE')::int AS negative,
        (SELECT COALESCE(SUM(${weightSql}), 0) FROM recent WHERE sentiment='POSITIVE')::float8 AS "weightedPositive",
        (SELECT COALESCE(SUM(${weightSql}), 0) FROM recent WHERE sentiment='NEUTRAL')::float8 AS "weightedNeutral",
        (SELECT COALESCE(SUM(${weightSql}), 0) FROM recent WHERE sentiment='NEGATIVE')::float8 AS "weightedNegative",
        (SELECT MAX("createdAt") FROM experiences) AS "latestAt",
        (SELECT MAX("createdAt") FROM recent) AS "recentLatestAt"
    `)
  return {
    total: counts?.total ?? 0,
    checked: {
      total: counts?.checked ?? 0,
      positive: counts?.checkedPositive ?? 0,
      neutral: counts?.checkedNeutral ?? 0,
      negative: counts?.checkedNegative ?? 0,
    },
    all: { positive: counts?.positive ?? 0, neutral: counts?.neutral ?? 0, negative: counts?.negative ?? 0 },
    weighted: {
      positive: counts?.weightedPositive ?? 0,
      neutral: counts?.weightedNeutral ?? 0,
      negative: counts?.weightedNegative ?? 0,
    },
    latestAt: counts?.latestAt ?? null,
    recentLatestAt: counts?.recentLatestAt ?? null,
  }
}

export type ExperienceSummaryData = Awaited<ReturnType<typeof experienceSummary>>
