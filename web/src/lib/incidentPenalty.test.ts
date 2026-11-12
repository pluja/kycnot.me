import assert from 'node:assert/strict'
import { test } from 'node:test'

import { computeIncidentTrustPenalty } from './incidentPenalty'

const resolvedAt = new Date('2026-10-30T00:00:00Z')

void test('a fix with no user loss keeps a fifth of the penalty on the day it resolves', () => {
  const penalty = computeIncidentTrustPenalty(
    { severity: 'MEDIUM', state: 'RESOLVED', resolvedAt, outcome: 'NO_USER_LOSS', trustOverride: null },
    resolvedAt
  )
  assert.equal(penalty.points, Math.round(-12 * 0.2))
  assert.equal(penalty.isDecaying, true)
})

void test('a fix with no user loss weighs less than an unknown outcome', () => {
  const at = new Date('2026-11-12T00:00:00Z')
  const noLoss = computeIncidentTrustPenalty(
    { severity: 'HIGH', state: 'RESOLVED', resolvedAt, outcome: 'NO_USER_LOSS', trustOverride: null },
    at
  )
  const unknown = computeIncidentTrustPenalty(
    { severity: 'HIGH', state: 'RESOLVED', resolvedAt, outcome: 'UNKNOWN', trustOverride: null },
    at
  )
  assert.ok(noLoss.points > unknown.points)
})
