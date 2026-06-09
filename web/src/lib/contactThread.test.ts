import assert from 'node:assert/strict'
import { test } from 'node:test'

import { CONTACT_MAX_UNANSWERED_MESSAGES, canUserSendMessage } from './contactThread'

test('resolved threads are always closed to new messages', () => {
  assert.equal(canUserSendMessage({ status: 'RESOLVED', unansweredUserMessages: 0 }), false)
})

test('an open thread with no unanswered messages accepts a message', () => {
  assert.equal(canUserSendMessage({ status: 'AWAITING_USER', unansweredUserMessages: 0 }), true)
})

test('below the cap is allowed, at/above the cap is blocked', () => {
  assert.equal(
    canUserSendMessage({
      status: 'AWAITING_STAFF',
      unansweredUserMessages: CONTACT_MAX_UNANSWERED_MESSAGES - 1,
    }),
    true
  )
  assert.equal(
    canUserSendMessage({
      status: 'AWAITING_STAFF',
      unansweredUserMessages: CONTACT_MAX_UNANSWERED_MESSAGES,
    }),
    false
  )
})
