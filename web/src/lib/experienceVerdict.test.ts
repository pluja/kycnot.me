import assert from 'node:assert/strict'
import { test } from 'node:test'

import { sentimentVerdict, summaryVerdict, verdictCounts } from './experienceVerdict'

const summary = (checked: { total: number; positive: number; neutral: number; negative: number }) => ({
  total: 20,
  checked,
  all: { positive: 4, neutral: 1, negative: 15 },
  weighted: { positive: 4, neutral: 1, negative: 15 },
  latestAt: new Date(),
  recentLatestAt: new Date(),
})

void test('the verdict follows the share of positive and negative experiences', () => {
  assert.equal(sentimentVerdict({ positive: 12, neutral: 3, negative: 1 })?.label, 'Mostly positive')
  assert.equal(sentimentVerdict({ positive: 2, neutral: 1, negative: 3 })?.label, 'Mostly negative')
  assert.equal(sentimentVerdict({ positive: 3, neutral: 2, negative: 2 })?.label, 'Mixed')
})

void test('a mixed experience counts as half positive, and never toward Mostly negative', () => {
  assert.equal(sentimentVerdict({ positive: 11, neutral: 3, negative: 2 })?.label, 'Mostly positive')
  assert.equal(sentimentVerdict({ positive: 15, neutral: 0, negative: 5 })?.label, 'Mostly positive')
  assert.equal(sentimentVerdict({ positive: 14, neutral: 0, negative: 6 })?.label, 'Mixed')
  assert.equal(sentimentVerdict({ positive: 0, neutral: 10, negative: 0 })?.label, 'Mixed')
  assert.equal(sentimentVerdict({ positive: 6, neutral: 4, negative: 10 })?.label, 'Mostly negative')
})

void test('the verdict counts only checked posts once at least 5 have checked proof', () => {
  const fiveChecked = summary({ total: 5, positive: 5, neutral: 0, negative: 0 })
  assert.equal(verdictCounts(fiveChecked).checkedOnly, true)
  assert.deepEqual(summaryVerdict(fiveChecked), { label: 'Mostly positive', tone: 'good' })

  const oneChecked = summary({ total: 1, positive: 1, neutral: 0, negative: 0 })
  assert.equal(verdictCounts(oneChecked).checkedOnly, false)
  assert.equal(summaryVerdict(oneChecked)?.label, 'Mostly negative')
  assert.equal(
    summaryVerdict(summary({ total: 4, positive: 4, neutral: 0, negative: 0 }))?.label,
    'Mostly negative'
  )
})

void test('no verdict rests on fewer than 3 rated posts', () => {
  assert.equal(sentimentVerdict({ positive: 2, neutral: 0, negative: 0 }), null)
  assert.equal(sentimentVerdict({ positive: 3, neutral: 0, negative: 0 })?.label, 'Mostly positive')
  assert.equal(sentimentVerdict({ positive: 0, neutral: 0, negative: 0 }), null)
})

void test("a newcomer's unproven post counts half, but still counts toward the minimum", () => {
  const counts = { positive: 4, neutral: 0, negative: 2 }
  assert.equal(sentimentVerdict(counts)?.label, 'Mixed')
  assert.equal(sentimentVerdict(counts, { positive: 4, neutral: 0, negative: 1 })?.label, 'Mostly positive')
  assert.equal(
    sentimentVerdict({ positive: 2, neutral: 0, negative: 0 }, { positive: 1, neutral: 0, negative: 0 }),
    null
  )
})
