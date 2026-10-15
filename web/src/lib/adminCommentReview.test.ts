import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compareTodo, todoRank, type TodoReason } from './adminCommentReview'

const day = (n: number) => new Date(Date.UTC(2026, 9, n))
const post = (overrides: Partial<Parameters<typeof todoRank>[0]> = {}) => ({
  id: 1,
  createdAt: day(1),
  aiDecidedAt: null,
  issues: [],
  experience: { sentiment: 'POSITIVE' as const },
  service: { verificationStatus: 'APPROVED' as const },
  contactThreads: [],
  revisions: [],
  evidence: [{ createdAt: day(2), legacyStatus: null }],
  ...overrides,
})
const rank = (
  id: number,
  reasons: TodoReason[],
  overrides: Partial<Parameters<typeof todoRank>[0]> = {}
) => ({
  id,
  ...todoRank(post({ id, ...overrides }), new Set(reasons)),
})

void test('the most urgent reason comes first, then the longest wait', () => {
  const order = [
    rank(1, ['proof']),
    rank(2, ['proof'], { experience: { sentiment: 'NEGATIVE' } }),
    rank(3, ['edits'], { revisions: [{ createdAt: day(5) }] }),
    rank(4, ['posts', 'proof'], { aiDecidedAt: day(6) }),
    rank(5, ['reports', 'proof'], { contactThreads: [{ createdAt: day(7), reportReason: 'SPAM' }] }),
    rank(6, ['reports'], { contactThreads: [{ createdAt: day(8), reportReason: 'PRIVATE_INFO' }] }),
  ]
    .sort(compareTodo)
    .map((item) => item.id)
  assert.deepEqual(order, [6, 5, 4, 3, 2, 1])
})

void test('within one level, listed services come first, then the oldest wait', () => {
  const order = [
    rank(1, ['posts'], { aiDecidedAt: day(3), service: { verificationStatus: 'COMMUNITY_CONTRIBUTED' } }),
    rank(2, ['posts'], { aiDecidedAt: day(9) }),
    rank(3, ['posts'], { aiDecidedAt: day(4) }),
  ]
    .sort(compareTodo)
    .map((item) => item.id)
  assert.deepEqual(order, [3, 2, 1])
})

void test('a problem tag puts proof ahead like a negative review does', () => {
  assert.equal(
    rank(1, ['oldProof'], { issues: ['FUNDS_BLOCKED'] }).level,
    rank(2, ['oldProof'], { experience: { sentiment: 'NEGATIVE' } }).level
  )
  assert.ok(rank(1, ['oldProof'], { issues: ['FUNDS_BLOCKED'] }).level < rank(3, ['oldProof']).level)
})

void test('old proof dates only its own list', () => {
  const evidence = [
    { createdAt: day(1), legacyStatus: 'PENDING' as const },
    { createdAt: day(9), legacyStatus: null },
  ]
  assert.deepEqual(rank(1, ['proof'], { evidence }).since, day(9))
  assert.deepEqual(rank(1, ['oldProof'], { evidence }).since, day(1))
})
