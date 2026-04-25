/* eslint-disable @typescript-eslint/no-floating-promises */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { findBestRateServiceSlug, sortSwapResults } from './swapResultUi'

test('sortSwapResults keeps best rate order for send side', () => {
  const sorted = sortSwapResults(
    [
      {
        serviceSlug: 'b',
        service: { overallScore: 80, kycLevel: 2 },
        quote: { amountFrom: 1, amountReceived: 9 },
        error: null,
      },
      {
        serviceSlug: 'a',
        service: { overallScore: 70, kycLevel: 1 },
        quote: { amountFrom: 1, amountReceived: 10 },
        error: null,
      },
    ],
    'rate',
    'send'
  )
  assert.deepEqual(sorted.map((item) => item.serviceSlug), ['a', 'b'])
})

test('sortSwapResults sorts by score descending with rate fallback', () => {
  const sorted = sortSwapResults(
    [
      {
        serviceSlug: 'low',
        service: { overallScore: 60, kycLevel: 1 },
        quote: { amountFrom: 1, amountReceived: 12 },
        error: null,
      },
      {
        serviceSlug: 'high',
        service: { overallScore: 90, kycLevel: 4 },
        quote: { amountFrom: 1, amountReceived: 10 },
        error: null,
      },
    ],
    'score',
    'send'
  )
  assert.deepEqual(sorted.map((item) => item.serviceSlug), ['high', 'low'])
})

test('sortSwapResults sorts by kyc ascending with rate fallback', () => {
  const sorted = sortSwapResults(
    [
      {
        serviceSlug: 'worse',
        service: { overallScore: 90, kycLevel: 3 },
        quote: { amountFrom: 1, amountReceived: 11 },
        error: null,
      },
      {
        serviceSlug: 'better',
        service: { overallScore: 70, kycLevel: 1 },
        quote: { amountFrom: 1, amountReceived: 10 },
        error: null,
      },
    ],
    'kyc',
    'send'
  )
  assert.deepEqual(sorted.map((item) => item.serviceSlug), ['better', 'worse'])
})

test('findBestRateServiceSlug returns best receive amount after non-rate sorting', () => {
  const sorted = sortSwapResults(
    [
      {
        serviceSlug: 'highest-score',
        service: { overallScore: 90, kycLevel: 1 },
        quote: { amountFrom: 1, amountReceived: 9 },
        error: null,
      },
      {
        serviceSlug: 'best-rate',
        service: { overallScore: 60, kycLevel: 2 },
        quote: { amountFrom: 1, amountReceived: 10 },
        error: null,
      },
    ],
    'score',
    'send'
  )

  assert.deepEqual(sorted.map((item) => item.serviceSlug), ['highest-score', 'best-rate'])
  assert.equal(findBestRateServiceSlug(sorted, 'send'), 'best-rate')
})
