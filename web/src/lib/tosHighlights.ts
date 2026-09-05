import { tosHighlightRatings } from '../constants/tosHighlightRating'

import type { VerificationStatus } from '@prisma/client'

export const TOS_REVIEW_ANCHOR = 'tos-review'

/** A review is written only for listings the team vetted; a flagged scam gets none. */
export const isTosReviewable = (status: VerificationStatus) =>
  status === 'VERIFICATION_SUCCESS' || status === 'APPROVED'

type Highlight = PrismaJson.TosReview['highlights'][number]

/** Legacy reviews stored numeric ratings: 0 was neutral, 1 and 2 negative. */
export function normalizeTosHighlightRating(rating: Highlight['rating'] | number): Highlight['rating'] {
  if (typeof rating !== 'number') return rating
  return rating === 0 ? 'neutral' : 'negative'
}

export function countTosHighlightRatings(highlights: Highlight[]) {
  return tosHighlightRatings
    .map((rating) => ({
      ...rating,
      count: highlights.filter((highlight) => normalizeTosHighlightRating(highlight.rating) === rating.id)
        .length,
    }))
    .filter((rating) => rating.count > 0)
}
