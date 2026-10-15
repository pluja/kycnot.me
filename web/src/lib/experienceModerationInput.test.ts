import assert from 'node:assert/strict'
import { test } from 'node:test'

import { defaultCheckTexts } from '../constants/evidenceCheckTexts'

import { evidenceCheckInput, publicationInput } from './experienceModerationInput'

void test('decisions must be explicit and preset reasons are validated', () => {
  assert.equal(publicationInput.safeParse({ commentId: 1 }).success, false)
  for (const status of ['PENDING', 'REJECTED']) {
    assert.equal(publicationInput.safeParse({ commentId: 1, status, decisionReason: 'SPAM' }).success, true)
    assert.equal(publicationInput.safeParse({ commentId: 1, status, decisionReason: 'OTHER' }).success, false)
    assert.equal(
      publicationInput.safeParse({ commentId: 1, status, decisionReason: 'MADE_UP' }).success,
      false
    )
  }
})

void test('switching to publish discards hidden hold and rejection fields', () => {
  for (const decisionReason of ['OTHER', 'SPAM']) {
    const result = publicationInput.parse({ commentId: 1, status: 'APPROVED', decisionReason, reason: 'bad' })
    assert.equal(result.reason, '')
    assert.equal(result.decisionReason, undefined)
  }
})

void test('routine approval accepts no reason, but rejection and hold require one', () => {
  for (const reason of [undefined, null, '']) {
    assert.equal(publicationInput.safeParse({ commentId: 1, status: 'APPROVED', reason }).success, true)
    for (const status of ['REJECTED', 'PENDING']) {
      assert.equal(publicationInput.safeParse({ commentId: 1, status, reason }).success, false)
      assert.equal(
        publicationInput.safeParse({
          commentId: 1,
          status,
          reason: 'Needs another moderator to review the conflict.',
        }).success,
        true
      )
    }
  }
})

void test('an order cannot be recorded as found or not found without the lookup confirmation', () => {
  for (const [finding, texts] of Object.entries(defaultCheckTexts)) {
    const input = { evidenceId: 1, finding, ...texts }
    assert.equal(
      evidenceCheckInput.safeParse(input).success,
      finding !== 'ORDER_FOUND' && finding !== 'ORDER_NOT_FOUND'
    )
    assert.equal(evidenceCheckInput.safeParse({ ...input, orderLookupConfirmed: true }).success, true)
  }
  assert.equal(
    evidenceCheckInput.safeParse({
      evidenceId: 1,
      finding: 'LEGACY',
      explanation: 'Cannot recreate an imported check.',
    }).success,
    false
  )
})

void test('order lookup confirmation accepts explicit checked values only', () => {
  const input = {
    evidenceId: 1,
    finding: 'ORDER_FOUND',
    explanation: 'The lookup distinguishes this order from an invalid reference.',
  }
  for (const orderLookupConfirmed of [undefined, null, false, 'false', '0', '', 1]) {
    assert.equal(evidenceCheckInput.safeParse({ ...input, orderLookupConfirmed }).success, false)
  }
  for (const orderLookupConfirmed of [true, 'true', 'on']) {
    assert.equal(evidenceCheckInput.safeParse({ ...input, orderLookupConfirmed }).success, true)
  }
})

void test('an empty explanation takes the standard wording for the result', () => {
  const parsed = evidenceCheckInput.parse({ evidenceId: 1, finding: 'INCONSISTENT', explanation: '' })
  assert.equal(parsed.explanation, defaultCheckTexts.INCONSISTENT.explanation)
  const typed = evidenceCheckInput.parse({
    evidenceId: 1,
    finding: 'INCONSISTENT',
    explanation: 'The order date does not match the lookup.',
  })
  assert.equal(typed.explanation, 'The order date does not match the lookup.')
  assert.equal(
    evidenceCheckInput.safeParse({ evidenceId: 1, finding: 'INCONSISTENT', explanation: 'abc' }).success,
    false
  )
})

void test('a different result keeps no stale standard wording', () => {
  const parsed = evidenceCheckInput.parse({
    evidenceId: 1,
    finding: 'UNABLE_TO_CHECK',
    ...defaultCheckTexts.ORDER_FOUND,
  })
  assert.equal(parsed.explanation, defaultCheckTexts.UNABLE_TO_CHECK.explanation)
})
