/* eslint-disable @typescript-eslint/no-floating-promises */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildAuditLines, intersectAcceptedAttributeIds } from './deepScan.helpers'

const proposedAdd = [
  { attributeId: 12, rationale: 'a' },
  { attributeId: 18, rationale: 'b' },
]
const proposedRemove = [{ attributeId: 7, rationale: 'c' }]

test('intersectAcceptedAttributeIds drops ids not present in the proposal', () => {
  assert.deepEqual(intersectAcceptedAttributeIds([12, 99, 18], proposedAdd), [12, 18])
  assert.deepEqual(intersectAcceptedAttributeIds([99], proposedAdd), [])
  assert.deepEqual(intersectAcceptedAttributeIds([], proposedAdd), [])
})

test('intersectAcceptedAttributeIds preserves order of inputIds', () => {
  assert.deepEqual(intersectAcceptedAttributeIds([18, 12], proposedAdd), [18, 12])
})

test('buildAuditLines produces a "no changes" line when nothing is accepted', () => {
  const lines = buildAuditLines({
    inputs: {
      acceptTosReview: false,
      acceptKycLevel: false,
      acceptKycPolicy: false,
      attributeAddIds: [],
      attributeRemoveIds: [],
    },
    proposedAttributes: { add: proposedAdd, remove: proposedRemove },
    proposedKycLevel: 3,
  })
  assert.equal(lines[0], 'Deep scan suggestion applied by admin')
  assert.ok(lines.includes('No changes accepted'))
})

test('buildAuditLines reports each accepted change exactly once', () => {
  const lines = buildAuditLines({
    inputs: {
      acceptTosReview: true,
      acceptKycLevel: true,
      acceptKycPolicy: true,
      attributeAddIds: [12, 18, 99],
      attributeRemoveIds: [7],
    },
    proposedAttributes: { add: proposedAdd, remove: proposedRemove },
    proposedKycLevel: 3,
  })
  const joined = lines.join('\n')
  assert.match(joined, /KYC level set to 3/)
  assert.match(joined, /ToS review published/)
  assert.match(joined, /KYC policy notes updated/)
  assert.match(joined, /Added attributes: 12, 18\b/)
  assert.match(joined, /Removed attributes: 7\b/)
  assert.doesNotMatch(joined, /99/)
  assert.ok(!lines.includes('No changes accepted'))
})

test('buildAuditLines uses the server-side proposed KYC level, not user input', () => {
  const lines = buildAuditLines({
    inputs: {
      acceptTosReview: false,
      acceptKycLevel: true,
      acceptKycPolicy: false,
      attributeAddIds: [],
      attributeRemoveIds: [],
    },
    proposedAttributes: { add: [], remove: [] },
    proposedKycLevel: 4,
  })
  assert.ok(lines.some((line) => line === 'KYC level set to 4'))
})
