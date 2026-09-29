import assert from 'node:assert/strict'
import { test } from 'node:test'

import { commentModerationAudit } from './commentModeration'

const before = { status: 'PENDING', privateProofStatus: null, ratingMuteReason: null } as const

void test('status changes name the new and previous status', () => {
  assert.deepEqual(commentModerationAudit({ commentId: 1, action: 'status', value: 'APPROVED' }, before), {
    action: 'STATUS_CHANGED',
    summary: 'Status set to approved, from pending',
  })
})

void test('proof status reads as none when the comment had no proof status', () => {
  assert.equal(
    commentModerationAudit({ commentId: 1, action: 'private-proof-status', value: 'REJECTED' }, before)
      .summary,
    'Private proof set to rejected, from none'
  )
})

void test('notes are quoted and shortened, and an empty note reads as cleared', () => {
  const long = commentModerationAudit({ commentId: 1, action: 'admin-note', value: 'x'.repeat(500) }, before)
  assert.equal(long.action, 'UPDATED')
  assert.ok(long.summary.startsWith('Admin note set: "xxx'))
  assert.ok(long.summary.length < 250)

  assert.equal(
    commentModerationAudit({ commentId: 1, action: 'public-note', value: '   ' }, before).summary,
    'Public note cleared'
  )
})

void test('issues read in plain words', () => {
  assert.equal(
    commentModerationAudit({ commentId: 1, action: 'add-issue', value: 'FUNDS_BLOCKED' }, before).summary,
    'Flagged issue: funds blocked'
  )
})
