import type { ServiceScanJobKind } from '@prisma/client'

// Only the full scan reads the terms, so the terms review is what tells the
// two jobs' proposals apart.
export const proposalJobKind = (proposedEdits: PrismaJson.ProposedEdits): ServiceScanJobKind =>
  'tosReview' in proposedEdits ? 'DEEP_SCAN' : 'DESCRIPTION'
