import { addDays } from 'date-fns'

import { countsAsProof, type ProofInput } from './proofEvidence'

import type { prisma } from './prisma'
import type { EvidenceFinding, ProofRequestSource } from '@prisma/client'

export const PROOF_REQUEST_DAYS = 7
export const MAX_DISPUTES_PER_SERVICE_PER_WEEK = 3

const proofRequestDueAt = (from = new Date()) => addDays(from, PROOF_REQUEST_DAYS)

type Evidence = ProofInput & { createdAt: Date; needsCheck: boolean; checks: { finding: EvidenceFinding }[] }

// proofRequestState mirrors unprovenSql in experienceQueries.ts. Accepted proof answers a request, and so does proof
// that could not be checked or that was sent by the due date and still waits for a check: neither is the author's
// fault. Proof sent later answers only once accepted, so resending after a failed check can't hold the request open.
// Unanswered past its due date, a published post reads as Unproven.
export function proofRequestState(request: { dueAt: Date }, evidence: Evidence[], now = new Date()) {
  const answered = evidence.some(
    (item) =>
      countsAsProof(item) ||
      (!item.removedAt &&
        ((item.needsCheck && item.createdAt <= request.dueAt) ||
          item.checks[0]?.finding === 'UNABLE_TO_CHECK'))
  )
  if (answered) return 'answered'
  return request.dueAt > now ? 'open' : 'unanswered'
}

// createProofRequest opens a request and tells the author, who has PROOF_REQUEST_DAYS to answer with proof.
// createProofRequest needs an author: a request nobody can answer would only turn the post Unproven.
export async function createProofRequest(
  tx: Pick<typeof prisma, 'notification' | 'proofRequest'>,
  request: {
    commentId: number
    authorId: number
    source: ProofRequestSource
    requestedById: number
    message?: string
  }
) {
  await tx.proofRequest.create({
    data: {
      commentId: request.commentId,
      source: request.source,
      requestedById: request.requestedById,
      message: request.message,
      dueAt: proofRequestDueAt(),
    },
  })
  await tx.notification.create({
    data: { userId: request.authorId, type: 'COMMENT_PROOF_REQUESTED', aboutCommentId: request.commentId },
  })
}
