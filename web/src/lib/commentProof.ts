import { subDays } from 'date-fns'

import { prisma } from './prisma'
import { classifyProof, suggestProofIdPattern } from './proofEvidence'

export async function classifyCommentProof(
  tx: Pick<typeof prisma, 'service'>,
  serviceId: number,
  body: string | null | undefined,
  hasImage: boolean
) {
  const settings = await tx.service.findUniqueOrThrow({
    where: { id: serviceId },
    select: { proofLookupUrl: true, proofIdPattern: true },
  })
  return classifyProof(body, hasImage, settings)
}

// reclassifyServiceProof re-reads all live evidence of a service with its current
// proof settings, so a newly added lookup URL or pattern applies to old posts too.
export async function reclassifyServiceProof(serviceId: number) {
  const service = await prisma.service.findUniqueOrThrow({
    where: { id: serviceId },
    select: { proofLookupUrl: true, proofIdPattern: true },
  })
  const evidence = await prisma.commentEvidence.findMany({
    where: { comment: { serviceId }, removedAt: null },
    select: { id: true, body: true, imagePath: true, kind: true, normalizedId: true, formatValid: true },
  })
  const changes = evidence
    .map((item) => ({ item, next: classifyProof(item.body, !!item.imagePath, service) }))
    .filter(
      ({ item, next }) =>
        next.kind !== item.kind ||
        next.normalizedId !== item.normalizedId ||
        next.formatValid !== item.formatValid
    )
  if (changes.length) {
    await prisma.$transaction(
      changes.map(({ item, next }) => prisma.commentEvidence.update({ where: { id: item.id }, data: next }))
    )
  }
  return changes.length
}

// proofIdPatternHealth tells admins whether a service's ID pattern still fits: how recent IDs match it, and
// whether IDs moderators accepted fail it, the sign that the service changed its format.
export async function proofIdPatternHealth(serviceId: number) {
  const withId = { comment: { serviceId }, normalizedId: { not: null }, removedAt: null }
  const [recent, accepted] = await Promise.all([
    prisma.commentEvidence.findMany({
      where: { ...withId, createdAt: { gte: subDays(new Date(), 90) } },
      select: { formatValid: true },
    }),
    prisma.commentEvidence.findMany({
      where: {
        ...withId,
        OR: [{ checks: { some: { finding: 'ORDER_FOUND' } } }, { legacyStatus: 'APPROVED' }],
      },
      select: { normalizedId: true, formatValid: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
  ])
  return {
    recentIds: recent.length,
    recentMatching: recent.filter((item) => item.formatValid === true).length,
    acceptedIds: accepted.length,
    acceptedNotMatching: accepted.filter((item) => item.formatValid === false).length,
    suggestedPattern: suggestProofIdPattern(accepted.flatMap((item) => item.normalizedId ?? [])),
  }
}
