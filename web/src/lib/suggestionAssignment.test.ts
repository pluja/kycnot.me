import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isStaleClaim } from './suggestionAssignment'

const now = new Date('2026-10-18T12:00:00Z')
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

void test('a claim goes stale after a week with no message or status change', () => {
  assert.equal(
    isStaleClaim({ status: 'UNDER_REVIEW', assignedAt: daysAgo(6), lastStaffMessageAt: null }, now),
    false
  )
  assert.equal(
    isStaleClaim({ status: 'UNDER_REVIEW', assignedAt: daysAgo(8), lastStaffMessageAt: null }, now),
    true
  )
})

void test('a recent staff message keeps an old claim fresh', () => {
  assert.equal(
    isStaleClaim({ status: 'UNDER_REVIEW', assignedAt: daysAgo(30), lastStaffMessageAt: daysAgo(2) }, now),
    false
  )
})

void test('closed and unclaimed suggestions are never stale', () => {
  assert.equal(
    isStaleClaim({ status: 'APPROVED', assignedAt: daysAgo(30), lastStaffMessageAt: null }, now),
    false
  )
  assert.equal(isStaleClaim({ status: 'PENDING', assignedAt: null, lastStaffMessageAt: null }, now), false)
})
