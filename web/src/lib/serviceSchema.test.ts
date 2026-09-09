import assert from 'node:assert/strict'
import { test } from 'node:test'

import { makeServiceReview, makeUserAggregateRating } from './serviceSchema'

import type { ItemList } from 'schema-dts'

const noteCount = (notes: unknown) => ((notes as ItemList).itemListElement as unknown[]).length

const author = { '@type': 'Organization', name: 'KYCnot.me' } as const

const base = {
  name: 'Trocador',
  overallScore: 8,
  privacyScore: 86.4,
  trustScore: 75,
  kycVerdict: {
    name: 'Guaranteed no KYC',
    description: 'Terms explicitly state KYC will never be requested.',
  },
  tosSummary: 'Trocador routes swaps through partners.',
  highlights: [
    { title: 'No registration', content: 'None needed.', rating: 'positive' as const },
    { title: 'Partner KYC', content: 'Partners may ask.', rating: 'negative' as const },
    { title: 'Fees', content: 'Shown up front.', rating: 'neutral' as const },
  ],
  isFlaggedScam: false,
  scamHeadline: 'Evidence indicates serious risk',
  listedAt: new Date('2024-11-11T00:00:00Z'),
  reviewedAt: new Date('2026-09-05T00:00:00Z'),
  author,
}

void test('a reviewed service gets the terms summary, the KYC verdict and both sub-scores', () => {
  const review = makeServiceReview(base)
  assert.equal(review.name, 'Trocador review')
  assert.equal(
    review.reviewBody,
    'Trocador routes swaps through partners. Guaranteed no KYC: Terms explicitly state KYC will never be requested. Privacy 86/100, trust 75/100.'
  )
  assert.deepEqual(review.reviewRating, { '@type': 'Rating', ratingValue: 8, bestRating: 10, worstRating: 0 })
  assert.equal(noteCount(review.positiveNotes), 1)
  assert.equal(noteCount(review.negativeNotes), 1)
  assert.equal(review.datePublished, '2024-11-11T00:00:00.000Z')
  assert.equal(review.dateModified, '2026-09-05T00:00:00.000Z')
})

void test('without a terms review the body still reads as a sentence and carries no notes', () => {
  const review = makeServiceReview({ ...base, tosSummary: null, highlights: [] })
  assert.equal(
    review.reviewBody,
    'Guaranteed no KYC: Terms explicitly state KYC will never be requested. Privacy 86/100, trust 75/100.'
  )
  assert.equal(review.positiveNotes, undefined)
  assert.equal(review.negativeNotes, undefined)
})

void test('a scam leads with the flag and keeps no notes, whatever the terms say', () => {
  const review = makeServiceReview({ ...base, isFlaggedScam: true, overallScore: 1 })
  assert.equal(
    review.reviewBody,
    'Trocador is flagged as a scam on KYCnot.me. Evidence indicates serious risk.'
  )
  assert.equal(review.positiveNotes, undefined)
  assert.equal((review.reviewRating as { ratingValue: number }).ratingValue, 1)
})

void test('the aggregate rating needs enough trusted weight and is rounded to one decimal', () => {
  const rating = makeUserAggregateRating({
    trustWeightedUserRating: 4.806403574087866,
    userRatingCount: 90,
    userRatingWeight: 12,
    minTrustedWeight: 3,
  })
  assert.deepEqual(rating, {
    '@type': 'AggregateRating',
    ratingValue: 4.8,
    bestRating: 5,
    worstRating: 1,
    ratingCount: 90,
  })
  assert.equal(
    makeUserAggregateRating({
      trustWeightedUserRating: 4.8,
      userRatingCount: 2,
      userRatingWeight: 1,
      minTrustedWeight: 3,
    }),
    undefined
  )
  assert.equal(
    makeUserAggregateRating({
      trustWeightedUserRating: null,
      userRatingCount: 0,
      userRatingWeight: 0,
      minTrustedWeight: 3,
    }),
    undefined
  )
})
