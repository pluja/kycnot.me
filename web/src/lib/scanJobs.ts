import type { ServiceScanJobKind } from '@prisma/client'

// proposalJobKind tells the two jobs' proposals apart by the terms review, which only the full scan reads.
export const proposalJobKind = (proposedEdits: PrismaJson.ProposedEdits): ServiceScanJobKind =>
  'tosReview' in proposedEdits ? 'DEEP_SCAN' : 'DESCRIPTION'

export const jobsId = (sectionId: string) => `${sectionId}-jobs`
