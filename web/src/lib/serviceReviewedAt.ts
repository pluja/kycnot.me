type ReviewedAtInput = {
  approvedAt: Date | null
  verifiedAt: Date | null
  tosReviewAt: Date | null
  events: { updatedAt: Date }[]
  verificationSteps: { updatedAt: Date }[]
}

/**
 * When we last touched the listing: an approval, a verification, a terms
 * review, or an event written or edited (attribute changes write one too).
 * Counters, scores and comments do not count, which is why `updatedAt` is not
 * used.
 */
export function latestReviewedAt(input: ReviewedAtInput): Date | null {
  const dates = [
    input.approvedAt,
    input.verifiedAt,
    input.tosReviewAt,
    ...input.events.map((event) => event.updatedAt),
    ...input.verificationSteps.map((step) => step.updatedAt),
  ].filter((date): date is Date => date !== null)
  if (dates.length === 0) return null
  return new Date(Math.max(...dates.map((date) => date.getTime())))
}
