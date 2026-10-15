import assert from 'node:assert/strict'
import { test } from 'node:test'

import { proofRequestState } from './proofRequests'

const asked = new Date('2026-10-01T00:00:00Z')
const request = { createdAt: asked, dueAt: new Date('2026-10-08T00:00:00Z') }
const before = new Date('2026-10-05T00:00:00Z')
const after = new Date('2026-10-09T00:00:00Z')
const proof = (finding: 'INCONSISTENT' | 'ORDER_FOUND' | 'UNABLE_TO_CHECK' | null, createdAt = before) => ({
  createdAt,
  removedAt: null,
  needsCheck: finding === null,
  checks: finding ? [{ finding }] : [],
})

void test('a request is open until its due date, then unanswered', () => {
  assert.equal(proofRequestState(request, [], before), 'open')
  assert.equal(proofRequestState(request, [], after), 'unanswered')
})

void test('accepted proof, proof waiting for a check, or proof that could not be checked answers it', () => {
  assert.equal(proofRequestState(request, [proof('ORDER_FOUND', new Date('2026-09-01'))], after), 'answered')
  assert.equal(proofRequestState(request, [proof(null)], after), 'answered')
  assert.equal(proofRequestState(request, [proof('UNABLE_TO_CHECK')], after), 'answered')
})

void test('proof sent before the request still answers it while it waits for a check', () => {
  assert.equal(proofRequestState(request, [proof(null, new Date('2026-09-01'))], after), 'answered')
})

void test('proof sent after the due date answers it only once accepted', () => {
  assert.equal(proofRequestState(request, [proof(null, after)], after), 'unanswered')
  assert.equal(proofRequestState(request, [proof('ORDER_FOUND', after)], after), 'answered')
})

void test('inconsistent proof does not answer it', () => {
  assert.equal(proofRequestState(request, [proof('INCONSISTENT')], after), 'unanswered')
})
