import assert from 'node:assert/strict'
import { test } from 'node:test'

import { scanFingerprint } from '../../../lib/scanFingerprint'

import { collectDeclines } from './deepScan.helpers'

const proposed = {
  contentHash: 'corpus-hash',
  tosReview: { kycLevel: 3, summary: '', complexity: 'low', highlights: [] },
  kycPolicy: { inferredLevel: 3, notesMd: '', rationale: '', levelFingerprint: 'open' },
  attributes: {
    add: [
      { attributeId: 12, rationale: 'a', sourceUrlKey: 'x.com/terms' },
      { attributeId: 13, rationale: 'b', sourceUrlKey: 'x.com/privacy' },
    ],
    remove: [{ attributeId: 7, rationale: 'c' }],
  },
  listingChecks: [
    {
      field: 'registrationCountryCode',
      current: 'SC',
      found: 'VG',
      quote: 'organized under the laws of the British Virgin Islands',
      sourceUrl: 'https://x.com/terms',
      sourceUrlKey: 'x.com/terms',
      fingerprint: 'ignored, recomputed here',
    },
  ],
  warnings: [],
} as unknown as PrismaJson.ProposedEdits

const collect = (accepted: { add?: number[]; remove?: number[]; listing?: string[]; kycLevel?: boolean }) =>
  collectDeclines({
    serviceId: 1,
    declinedById: 99,
    proposed,
    documentHashes: new Map([
      ['x.com/terms', 'terms-hash'],
      ['x.com/privacy', 'privacy-hash'],
    ]),
    acceptedAttributeAdd: accepted.add ?? [],
    acceptedAttributeRemove: accepted.remove ?? [],
    acceptedListingFields: accepted.listing ?? [],
    acceptedKycLevel: accepted.kycLevel ?? true,
  })

test('collectDeclines records everything left unticked', () => {
  const rows = collect({})

  assert.equal(rows.length, 4)
  assert.deepEqual(rows.map((row) => row.kind).sort(), [
    'attribute:add',
    'attribute:add',
    'attribute:remove',
    'listing',
  ])
})

test('collectDeclines records nothing a reviewer accepted', () => {
  const rows = collect({ add: [12, 13], remove: [7], listing: ['registrationCountryCode'] })

  assert.deepEqual(rows, [])
})

test('collectDeclines remembers a KYC level a reviewer left alone', () => {
  const accepted = { add: [12, 13], remove: [7], listing: ['registrationCountryCode'] }
  const rows = collect({ ...accepted, kycLevel: false })

  assert.equal(rows.length, 1)
  assert.equal(rows[0]!.kind, 'kycLevel')
  // Keyed on the level, so a later move to 4 is still free to be proposed.
  assert.equal(rows[0]!.fingerprint, scanFingerprint(1, 'kycLevel', 3))
})

test('collectDeclines does not record a level the reviewer was never offered', () => {
  // The row renders disabled when the level is not open, and a disabled checkbox
  // submits nothing. Reading that as a decision would suppress a level for good
  // that nobody ever turned down.
  const rows = collect({
    add: [12, 13],
    remove: [7],
    listing: ['registrationCountryCode'],
    kycLevel: true,
  })

  assert.deepEqual(rows, [])
})

test('collectDeclines leaves the KYC level alone when no change was proposed', () => {
  const unchanged = {
    ...proposed,
    kycPolicy: { ...proposed.kycPolicy, levelFingerprint: null },
  } as PrismaJson.ProposedEdits
  const rows = collectDeclines({
    serviceId: 1,
    declinedById: 99,
    proposed: unchanged,
    documentHashes: new Map(),
    acceptedAttributeAdd: [12, 13],
    acceptedAttributeRemove: [7],
    acceptedListingFields: ['registrationCountryCode'],
    acceptedKycLevel: false,
  })

  assert.deepEqual(rows, [])
})

test('collectDeclines records only the unticked half of a partial accept', () => {
  const rows = collect({ add: [12] })

  assert.deepEqual(rows.map((row) => row.label).sort(), [
    'Add attribute 13',
    'Remove attribute 7',
    'registrationCountryCode: keep SC over VG',
  ])
})

test('collectDeclines recomputes the fingerprint rather than trusting the payload', () => {
  // A hand-edited suggestion must not be able to bury an unrelated proposal.
  const listing = collect({}).find((row) => row.kind === 'listing')

  assert.ok(listing)
  assert.notEqual(listing.fingerprint, 'ignored, recomputed here')
  assert.equal(listing.fingerprint, scanFingerprint(1, 'listing', 'registrationCountryCode'))
})

test('collectDeclines binds a decline to the document it came from', () => {
  const rows = collect({})
  const byLabel = new Map(rows.map((row) => [row.label, row]))

  // Held against the page it was drawn from, so an edit elsewhere cannot lift it.
  assert.equal(byLabel.get('Add attribute 12')?.sourceUrlKey, 'x.com/terms')
  assert.equal(byLabel.get('Add attribute 12')?.sourceContentHash, 'terms-hash')
  assert.equal(byLabel.get('Add attribute 13')?.sourceContentHash, 'privacy-hash')
})

test('collectDeclines makes a decline final when the proposal named no source', () => {
  // Nothing to watch for a change, so erring quiet is the right direction.
  const orphan = collect({}).find((row) => row.label === 'Remove attribute 7')

  assert.ok(orphan)
  assert.equal(orphan.sourceUrlKey, null)
  assert.equal(orphan.sourceContentHash, null)
})

test('collectDeclines records who declined', () => {
  for (const row of collect({})) {
    assert.equal(row.declinedById, 99)
  }
})

test('collectDeclines survives a scan that predates listing checks', () => {
  const older = { ...proposed, listingChecks: undefined } as PrismaJson.ProposedEdits
  const rows = collectDeclines({
    serviceId: 1,
    declinedById: 99,
    proposed: older,
    documentHashes: new Map(),
    acceptedAttributeAdd: [],
    acceptedAttributeRemove: [],
    acceptedListingFields: [],
    acceptedKycLevel: true,
  })

  assert.equal(rows.length, 3)
})
