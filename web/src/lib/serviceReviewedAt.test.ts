import assert from 'node:assert/strict'
import { test } from 'node:test'

import { latestReviewedAt } from './serviceReviewedAt'

const day = (iso: string) => new Date(`${iso}T00:00:00Z`)

void test('picks the newest of the review actions', () => {
  const reviewedAt = latestReviewedAt({
    approvedAt: day('2024-11-11'),
    verifiedAt: day('2026-04-09'),
    tosReviewAt: day('2026-09-01'),
    events: [{ updatedAt: day('2026-04-21') }, { updatedAt: day('2026-08-23') }],
    verificationSteps: [{ updatedAt: day('2026-05-02') }],
  })
  assert.equal(reviewedAt?.toISOString(), day('2026-09-01').toISOString())
})

void test('a listing nobody touched has no reviewed date', () => {
  assert.equal(
    latestReviewedAt({
      approvedAt: null,
      verifiedAt: null,
      tosReviewAt: null,
      events: [],
      verificationSteps: [],
    }),
    null
  )
})

void test('an event edit alone is enough', () => {
  const reviewedAt = latestReviewedAt({
    approvedAt: null,
    verifiedAt: null,
    tosReviewAt: null,
    events: [{ updatedAt: day('2026-07-15') }],
    verificationSteps: [],
  })
  assert.equal(reviewedAt?.toISOString(), day('2026-07-15').toISOString())
})
