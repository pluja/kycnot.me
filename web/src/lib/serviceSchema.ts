import { normalizeTosHighlightRating } from './tosHighlights'

import type { ItemList, Organization, Review } from 'schema-dts'

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

// makeServiceReview states our own verdict as one Review. A flagged scam says so before anything else,
// so a snippet built from the body cannot read as an endorsement.
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
