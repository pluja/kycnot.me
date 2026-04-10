import type { VerificationStatus, VerificationStepStatus } from '@prisma/client'

type VerificationStepLike = {
  status: VerificationStepStatus
  updatedAt: Date
}

type ServiceVerificationLike = {
  verificationStatus: VerificationStatus
  approvedAt: Date | null
  verifiedAt: Date | null
  verificationSteps: VerificationStepLike[]
}

export function getServiceVerificationOverview(service: ServiceVerificationLike) {
  const counts: Record<VerificationStepStatus, number> = {
    PENDING: 0,
    IN_PROGRESS: 0,
    PASSED: 0,
    FAILED: 0,
    WARNING: 0,
  }

  let latestStepUpdate: Date | null = null

  for (const step of service.verificationSteps) {
    counts[step.status] += 1
    if (!latestStepUpdate || step.updatedAt > latestStepUpdate) {
      latestStepUpdate = step.updatedAt
    }
  }

  const totalChecks = service.verificationSteps.length
  const completedChecks = counts.PASSED + counts.WARNING + counts.FAILED
  const statusRecordedAt =
    service.verificationStatus === 'VERIFICATION_SUCCESS' ? service.verifiedAt : service.approvedAt

  const checksSummary =
    totalChecks === 0
      ? 'No review checks have been published yet'
      : counts.PASSED === totalChecks
        ? `${String(counts.PASSED)}/${String(totalChecks)} checks passed`
        : [
            counts.PASSED > 0 ? `${String(counts.PASSED)} passed` : null,
            counts.WARNING > 0 ? `${String(counts.WARNING)} warning${counts.WARNING === 1 ? '' : 's'}` : null,
            counts.FAILED > 0 ? `${String(counts.FAILED)} failed` : null,
            counts.IN_PROGRESS > 0 ? `${String(counts.IN_PROGRESS)} in progress` : null,
            counts.PENDING > 0 ? `${String(counts.PENDING)} pending` : null,
          ]
            .filter(Boolean)
            .join(' • ')

  return {
    counts,
    totalChecks,
    completedChecks,
    checksSummary,
    lastReviewAt: latestStepUpdate ?? statusRecordedAt,
  }
}
