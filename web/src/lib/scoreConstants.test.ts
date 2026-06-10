import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { kycLevels } from '../constants/kycLevels'
import { verificationStatusesByValue } from '../constants/verificationStatus'

import { nonDbAttributes } from './attributes'

// The derived scoring constants exist in both the SQL trigger that computes the stored
// score and the TS display constants. They must stay equal; this test is the canonical
// reference and fails if either side diverges.
const sql = readFileSync(new URL('../../prisma/triggers/02_service_score.sql', import.meta.url), 'utf8')
const kycLevelById = new Map<string, (typeof kycLevels)[number]>(
  kycLevels.map((level) => [level.id, level])
)
const derivedBySlug = new Map(nonDbAttributes.map((attribute) => [attribute.slug, attribute]))
const verificationByValue = verificationStatusesByValue as Record<string, { trustPoints: number }>

test('KYC level privacy points match the SQL trigger', () => {
  const expected: Record<string, number> = { '0': 25, '1': 10, '2': -5, '3': -15, '4': -25 }
  for (const [id, points] of Object.entries(expected)) {
    assert.equal(kycLevelById.get(id)?.privacyPoints, points, `TS kyc level ${id}`)
    assert.match(sql, new RegExp(`"kycLevel"\\s*=\\s*${id}\\s+THEN\\s+${String(points)}\\b`), `SQL kyc level ${id}`)
  }
})

test('Verification status trust points match the SQL trigger', () => {
  const expected: Record<string, number> = {
    VERIFICATION_SUCCESS: 10,
    APPROVED: 5,
    COMMUNITY_CONTRIBUTED: 0,
    VERIFICATION_FAILED: -50,
  }
  for (const [status, points] of Object.entries(expected)) {
    assert.equal(verificationByValue[status]?.trustPoints, points, `TS verification ${status}`)
    assert.match(sql, new RegExp(`'${status}'\\s+THEN\\s+${String(points)}\\b`), `SQL verification ${status}`)
  }
})

test('Derived attribute points match the SQL trigger', () => {
  const cases = [
    { slug: 'recently-approved', field: 'trustPoints', value: -10, sql: /recently_approved_factor\s*:=\s*-10\b/ },
    { slug: 'has-onion-or-i2p-urls', field: 'privacyPoints', value: 5, sql: /onion_or_i2p_factor\s*:=\s*5\b/ },
    { slug: 'monero-accepted', field: 'privacyPoints', value: 5, sql: /monero_factor\s*:=\s*5\b/ },
    { slug: 'cannot-analyse-tos', field: 'trustPoints', value: -3, sql: /tos_penalty_factor\s*:=\s*-3\b/ },
    { slug: 'new-service', field: 'trustPoints', value: -4, sql: /INTERVAL '1 year'\s+THEN\s+-4\b/ },
    { slug: 'mature-service', field: 'trustPoints', value: 5, sql: /INTERVAL '2 years'\s+THEN\s+5\b/ },
    { slug: 'legally-registered', field: 'trustPoints', value: 2, sql: /legally_registered_factor\s*:=\s*2\b/ },
  ] as const
  for (const { slug, field, value, sql: sqlPattern } of cases) {
    assert.equal(derivedBySlug.get(slug)?.[field], value, `TS ${slug}`)
    assert.match(sql, sqlPattern, `SQL ${slug}`)
  }
})

test('Base score and weights match the SQL trigger', () => {
  assert.match(sql, /privacy_score\s*:=\s*50\s*\+/, 'SQL privacy base 50')
  assert.match(sql, /trust_score\s*:=\s*50\s*\+/, 'SQL trust base 50')
  assert.match(sql, /privacy_score\s*\*\s*0\.6/, 'SQL privacy weight 0.6')
  assert.match(sql, /trust_score\s*\*\s*0\.4/, 'SQL trust weight 0.4')
})
