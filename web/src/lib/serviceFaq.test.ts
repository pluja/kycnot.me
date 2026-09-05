import assert from 'node:assert/strict'
import { test } from 'node:test'

import { makeServiceFaq } from './serviceFaq'

const base = {
  name: 'Trocador',
  description: '**Exchange aggregator** focused on privacy.',
  summary: 'Trocador is an aggregator service that accepts Monero and Bitcoin.',
  questions: { kyc: 'Will Trocador ask for your ID?', trust: 'Is your money safe on Trocador?' },
  kyc: { tone: 'good' as const, answer: 'No KYC, guaranteed', detail: 'Their terms say so.' },
  safety: {
    tone: 'good' as const,
    answer: 'Nothing negative on record',
    detail: 'Reviewed and clean so far.',
  },
  isFlaggedScam: false,
  statusLabel: 'Verified',
  statusDescription: 'Passed repeated checks over time.',
  currencyNames: ['Monero', 'Bitcoin', 'Lightning'],
  onionHosts: ['abc.onion'],
  i2pHosts: [],
  ratingCount: 89,
  averageRating: 4.7,
  tosSummary: 'Routes swaps through partners.',
}

void test('every question is answered from page data, markdown stripped', () => {
  const faq = makeServiceFaq(base)
  assert.deepEqual(
    faq.map((entry) => entry.question),
    [
      'What is Trocador?',
      'Will Trocador ask for your ID?',
      'Is your money safe on Trocador?',
      'Is Trocador a scam?',
      'Which currencies does Trocador accept?',
      'Does Trocador have a Tor onion or I2P address?',
      'How do users rate Trocador?',
      'What do the terms of service of Trocador say?',
    ]
  )
  assert.equal(
    faq[0]?.answer,
    'Exchange aggregator focused on privacy. Trocador is an aggregator service that accepts Monero and Bitcoin.'
  )
  assert.equal(faq[4]?.answer, 'Trocador accepts Monero, Bitcoin, and Lightning.')
  assert.match(faq[3]?.answer ?? '', /^Trocador is not flagged as a scam\. Its listing status is Verified/)
})

void test('questions without data are left out, and a flagged service says so', () => {
  const faq = makeServiceFaq({
    ...base,
    isFlaggedScam: true,
    currencyNames: [],
    onionHosts: [],
    ratingCount: 0,
    tosSummary: null,
  })
  assert.deepEqual(
    faq.map((entry) => entry.question),
    [
      'What is Trocador?',
      'Will Trocador ask for your ID?',
      'Is your money safe on Trocador?',
      'Is Trocador a scam?',
    ]
  )
  assert.match(faq[3]?.answer ?? '', /^Trocador is flagged as a scam/)
})
