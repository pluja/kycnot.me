import assert from 'node:assert/strict'
import { test } from 'node:test'

import { restoredStatus } from './withdrawal'

const withdrawn = {
  status: 'WITHDRAWN' as const,
  statusBeforeWithdrawal: 'APPROVED' as const,
  version: 3,
  withdrawnVersion: 3,
}

void test('an unchanged published post comes back published', () => {
  assert.equal(restoredStatus(withdrawn), 'APPROVED')
})

void test('a changed or pending post goes back through moderation', () => {
  assert.equal(restoredStatus({ ...withdrawn, version: 4 }), 'PENDING')
  assert.equal(restoredStatus({ ...withdrawn, statusBeforeWithdrawal: 'PENDING' }), 'PENDING')
})

void test('placeholders and posts that were never withdrawn cannot be restored', () => {
  assert.equal(restoredStatus({ ...withdrawn, statusBeforeWithdrawal: null }), null)
  assert.equal(restoredStatus({ ...withdrawn, status: 'APPROVED' }), null)
})
