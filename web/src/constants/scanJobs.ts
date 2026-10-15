import type { Prisma } from '@prisma/client'

// SCAN_CLAIM_TIMEOUT_MS is how long a claimed job may sit before it counts as abandoned by a dead worker.
// It mirrors SERVICE_SCAN_CLAIM_TIMEOUT_MINUTES in the worker's config.
export const SCAN_CLAIM_TIMEOUT_MS = 15 * 60 * 1000

export const scanJobSelect = {
  id: true,
  kind: true,
  createdAt: true,
  claimedAt: true,
  processedAt: true,
  error: true,
} satisfies Prisma.ServiceScanJobSelect

export type ScanJob = Prisma.ServiceScanJobGetPayload<{ select: typeof scanJobSelect }>
