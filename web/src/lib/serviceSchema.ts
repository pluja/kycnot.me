import { normalizeTosHighlightRating } from './tosHighlights'

import type { AggregateRating, ItemList, Organization, Review } from 'schema-dts'

type Highlight = PrismaJson.TosReview['highlights'][number]

type ReviewInput = {
  name: string
  overallScore: number
  privacyScore: number
  trustScore: number
  kycVerdict: { name: string; description: string }
  tosSummary: string | null
  highlights: Highlight[]
  isFlaggedScam: boolean
  scamHeadline: string
  listedAt: Date | null
  reviewedAt: Date | null
  author: Organization
}

const notesList = (highlights: Highlight[], rating: Highlight['rating']): ItemList | undefined => {
  const items = highlights.filter((highlight) => normalizeTosHighlightRating(highlight.rating) === rating)
  if (items.length === 0) return undefined
  return {
    '@type': 'ItemList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.title,
      description: item.content,
    })),
  }
}

/**
 * Our own verdict as one Review. A flagged scam says so before anything else,
 * so a snippet built from the body cannot read as an endorsement.
 */
export function makeServiceReview(input: ReviewInput): Review {
  const body = input.isFlaggedScam
    ? [`${input.name} is flagged as a scam on KYCnot.me.`, `${input.scamHeadline}.`]
    : [
        input.tosSummary,
        `${input.kycVerdict.name}: ${input.kycVerdict.description}`,
        `Privacy ${String(Math.round(input.privacyScore))}/100, trust ${String(Math.round(input.trustScore))}/100.`,
      ]
  return {
    '@type': 'Review',
    name: `${input.name} review`,
    author: input.author,
    reviewBody: body.filter((sentence): sentence is string => !!sentence).join(' '),
    reviewRating: {
      '@type': 'Rating',
      ratingValue: input.overallScore,
      bestRating: 10,
      worstRating: 0,
    },
    positiveNotes: input.isFlaggedScam ? undefined : notesList(input.highlights, 'positive'),
    negativeNotes: input.isFlaggedScam ? undefined : notesList(input.highlights, 'negative'),
    datePublished: input.listedAt?.toISOString(),
    dateModified: input.reviewedAt?.toISOString(),
  }
}

type RatingInput = {
  trustWeightedUserRating: number | null
  userRatingCount: number
  userRatingWeight: number
  minTrustedWeight: number
}

/** The users' verdict, only once enough trusted weight stands behind the number shown under the stars. */
export function makeUserAggregateRating(input: RatingInput): AggregateRating | undefined {
  if (input.trustWeightedUserRating === null || input.userRatingWeight < input.minTrustedWeight) {
    return undefined
  }
  return {
    '@type': 'AggregateRating',
    ratingValue: Math.round(input.trustWeightedUserRating * 10) / 10,
    bestRating: 5,
    worstRating: 1,
    ratingCount: input.userRatingCount,
  }
}
