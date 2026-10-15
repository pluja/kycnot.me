import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import { EvidenceFinding } from '@prisma/client'

import { countingFindings } from '../constants/experiences'

import {
  classifyProof,
  isHeldOnlyForProof,
  proofGateReasons,
  suggestProofIdPattern,
  countsAsProof,
  lookupUrlFor,
  proofIdRegex,
  proofStatus,
  publicProofView,
  shownProofKind,
  summarizeProof,
} from './proofEvidence'

const pegasus = { proofLookupUrl: 'https://pegasusswap.com/exchange/{id}', proofIdPattern: '[A-Z0-9]{6}' }
const none = { proofLookupUrl: null, proofIdPattern: null }

void test('lookup links are reduced to the order ID and checked against the pattern', () => {
  assert.deepEqual(classifyProof('https://pegasusswap.com/exchange/IXHUTQ', false, pegasus), {
    kind: 'LOOKUP_LINK',
    normalizedId: 'IXHUTQ',
    formatValid: true,
  })
  assert.equal(
    classifyProof('http://pegasusswap.com/exchange/IXHUTQ?ref=1', false, pegasus).normalizedId,
    'IXHUTQ'
  )
  assert.deepEqual(classifyProof('IXHUTQ', false, pegasus), {
    kind: 'ORDER_ID',
    normalizedId: 'IXHUTQ',
    formatValid: true,
  })
  assert.equal(classifyProof('abc', false, pegasus).formatValid, false)
  assert.equal(classifyProof('abc', false, none).formatValid, null)
})

void test('transaction IDs, addresses, other links, screenshots and notes are told apart', () => {
  const txid = 'a'.repeat(64)
  assert.equal(classifyProof(txid, false, pegasus).kind, 'TRANSACTION_ID')
  assert.equal(classifyProof(`0x${'b'.repeat(64)}`, false, none).kind, 'TRANSACTION_ID')
  assert.equal(
    classifyProof('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', false, none).kind,
    'TRANSACTION_ID'
  )
  assert.equal(classifyProof('https://imgur.com/a/xyz', false, pegasus).kind, 'EXTERNAL_LINK')
  assert.equal(classifyProof('', true, pegasus).kind, 'SCREENSHOT')
  assert.equal(classifyProof('Paid by card, invoice in email', false, none).kind, 'NOTE')
})

void test('proof counts only after a human decided', () => {
  const base = { removedAt: null }
  assert.equal(countsAsProof(base), false)
  assert.equal(publicProofView(base).state, 'unchecked')
  assert.equal(countsAsProof({ ...base, checks: [{ finding: 'ORDER_FOUND' }] }), true)
  assert.equal(countsAsProof({ ...base, checks: [{ finding: 'SCREENSHOT_REVIEWED' }] }), true)
  assert.equal(countsAsProof({ ...base, checks: [{ finding: 'UNABLE_TO_CHECK' }] }), false)
  assert.equal(
    countsAsProof({ ...base, checks: [{ finding: 'INCONSISTENT' }, { finding: 'ORDER_FOUND' }] }),
    false
  )
  assert.equal(countsAsProof({ ...base, removedAt: new Date(), checks: [{ finding: 'ORDER_FOUND' }] }), false)
})

void test('readers see the latest published result', () => {
  const base = { removedAt: null }
  assert.deepEqual(publicProofView({ ...base, checks: [{ finding: 'INCONSISTENT' }] }), {
    state: 'result',
    finding: 'INCONSISTENT',
    counts: false,
  })
})

void test('the service pattern wins, broken links and screenshots are handled', () => {
  const numeric = { proofLookupUrl: 'https://shop.test/exchange/{id}', proofIdPattern: '[0-9]+' }
  assert.equal(classifyProof('12345678912345678912345678', false, numeric).kind, 'ORDER_ID')
  assert.equal(classifyProof('https://shop.test/exchange/%E0%A4', false, numeric).kind, 'EXTERNAL_LINK')
  assert.equal(classifyProof('a'.repeat(64), true, none).kind, 'SCREENSHOT')
})

void test('patterns and lookup URLs are built safely', () => {
  assert.equal(proofIdRegex('[unclosed'), null)
  assert.equal(proofIdRegex('(a|a)*'), null)
  assert.equal(proofIdRegex('a)|(?:.*'), null)
  assert.equal(proofIdRegex('.*.*.*.*.*x'), null)
  assert.equal(proofIdRegex('[A-Z]{6}|[0-9]{8}')?.test('12345678'), true)
  assert.equal(proofIdRegex('[A-Z]{3}')?.test('ABCD'), false)
  assert.equal(lookupUrlFor(pegasus.proofLookupUrl, 'A B'), 'https://pegasusswap.com/exchange/A%20B')
  assert.equal(lookupUrlFor(null, 'X'), null)
})

void test('legacy checks follow the old verdict and every result explains itself', () => {
  const base = { removedAt: null }
  const legacy = [{ finding: 'LEGACY' as const }]
  assert.equal(proofStatus({ ...base, legacyStatus: 'APPROVED', checks: legacy }).counts, true)
  assert.equal(proofStatus({ ...base, legacyStatus: 'REJECTED', checks: legacy }).counts, false)
  assert.equal(proofStatus({ ...base, legacyStatus: 'WITHDRAWN', checks: legacy }).counts, false)
  assert.equal(publicProofView({ ...base, legacyStatus: 'REJECTED', checks: legacy }).state, 'notCounted')
})

void test('an accepted check publishes only a post held for its proof alone', () => {
  const held = {
    status: 'PENDING' as const,
    humanAction: null,
    aiAction: 'HOLD' as const,
    aiSignals: { recommendedAction: 'approve', hardGateReason: proofGateReasons[0] },
  }
  assert.equal(isHeldOnlyForProof(held, 0), true)
  assert.equal(isHeldOnlyForProof(held, 1), false)
  assert.equal(
    isHeldOnlyForProof(
      { ...held, aiSignals: { recommendedAction: 'approve', hardGateReason: 'private proof present' } },
      0
    ),
    true
  )
  assert.equal(
    isHeldOnlyForProof(
      {
        ...held,
        aiSignals: {
          recommendedAction: 'approve',
          hardGateReason:
            'spam flag needs a consistent publication decision, proof awaiting a moderator check',
        },
      },
      0
    ),
    false
  )
  assert.equal(
    isHeldOnlyForProof(
      { ...held, aiSignals: { recommendedAction: 'human_review', hardGateReason: proofGateReasons[0] } },
      0
    ),
    false
  )
  assert.equal(isHeldOnlyForProof({ ...held, humanAction: 'HOLD' as const }, 0), false)
  assert.equal(isHeldOnlyForProof({ ...held, status: 'APPROVED' as const }, 0), false)
})

void test('a suggested ID pattern fits every accepted ID', () => {
  const suggested = (ids: string[]) => suggestProofIdPattern(ids)?.pattern
  assert.equal(suggested(['aBCDEFg1Hi', 'Xy3kLmNoPq', 'ab12CD34ef']), '[A-Za-z0-9]{10}')
  assert.equal(suggested(['482913', '1234567', '99881122']), '[0-9]{6,8}')
  assert.equal(suggested(['9f8e7d6c5b4a', '0a1b2c3d4e5f', 'abcdef012345']), '[a-f0-9]{12}')
  assert.equal(suggested(['AB-12', 'CD-34', 'EF-56']), '[A-Z0-9\\-]{5}')
  assert.equal(suggestProofIdPattern(['a b', 'c d', 'e f']), null)
  assert.equal(suggestProofIdPattern(['only', 'two']), null)
  assert.equal(suggestProofIdPattern(['abc123', 'abc123abc123abc123', 'abcdef'])?.loose, true)
  for (const ids of [
    ['aBCDEFg1Hi', 'Xy3kLmNoPq', 'ab12CD34ef'],
    ['AB-12', 'CD-34', 'EF-56'],
  ]) {
    const pattern = proofIdRegex(suggested(ids) ?? null)
    assert.ok(pattern && ids.every((id) => pattern.test(id)))
  }
})

void test('an order ID or lookup link inside a note is found', () => {
  const plain = { proofLookupUrl: null, proofIdPattern: null }
  assert.deepEqual(classifyProof('Swap ID  IF00D9', false, plain), {
    kind: 'ORDER_ID',
    normalizedId: 'IF00D9',
    formatValid: null,
  })
  assert.equal(classifyProof('Paid 100 USDT on TRC20, took 10min', false, plain).kind, 'NOTE')
  assert.equal(classifyProof('Orders AB12CD and EF34GH', false, plain).kind, 'NOTE')
  assert.equal(classifyProof("I can't find it, they delete invoices", false, plain).kind, 'NOTE')
  const patterned = { proofLookupUrl: 'https://swap.example/order/{id}', proofIdPattern: '[A-Z0-9]{6}' }
  assert.deepEqual(classifyProof('order IF00D9 for 10000 USD, ref abc123x', false, patterned), {
    kind: 'ORDER_ID',
    normalizedId: 'IF00D9',
    formatValid: true,
  })
  assert.deepEqual(classifyProof('stuck: https://swap.example/order/QW12ER please', false, patterned), {
    kind: 'LOOKUP_LINK',
    normalizedId: 'QW12ER',
    formatValid: true,
  })
  assert.equal(classifyProof('my swap id was ab12cd34ef', false, patterned).formatValid, false)
})

void test('a cleared note no longer waits for a check and never counts', () => {
  const cleared = { removedAt: null, needsCheck: false, checks: [] }
  assert.deepEqual(publicProofView(cleared), { state: 'notCounted' })
  assert.equal(summarizeProof([cleared]), 'none')
  assert.equal(summarizeProof([{ removedAt: null, needsCheck: true, checks: [] }]), 'unchecked')
})

void test('proof that supports the claim counts and an order not found does not', () => {
  assert.equal(countsAsProof({ removedAt: null, checks: [{ finding: 'CLAIM_SUPPORTED' }] }), true)
  assert.equal(countsAsProof({ removedAt: null, checks: [{ finding: 'ORDER_NOT_FOUND' }] }), false)
})

void test('the trust trigger counts the same results as the app', async () => {
  const sql = await readFile(new URL('../../prisma/triggers/18_user_trust.sql', import.meta.url), 'utf8')
  const listed = /finding::text IN \(([^)]+)\)/.exec(sql)?.[1]?.match(/[A-Z_]+/g) ?? []
  assert.deepEqual([...listed].sort(), [...countingFindings].sort())
  for (const finding of Object.values(EvidenceFinding)) {
    if (finding === 'LEGACY') continue
    const counts = countsAsProof({ removedAt: null, checks: [{ finding }] })
    assert.equal(counts, countingFindings.includes(finding), finding)
  }
})

void test('readers see the kind the check was about', () => {
  assert.equal(shownProofKind('SCREENSHOT', 'ORDER_FOUND'), 'ORDER_ID')
  assert.equal(shownProofKind('SCREENSHOT', 'ORDER_NOT_FOUND'), 'ORDER_ID')
  assert.equal(shownProofKind('LOOKUP_LINK', 'ORDER_FOUND'), 'LOOKUP_LINK')
  assert.equal(shownProofKind('ORDER_ID', 'SCREENSHOT_REVIEWED'), 'SCREENSHOT')
  assert.equal(shownProofKind('SCREENSHOT', 'CLAIM_SUPPORTED'), 'SCREENSHOT')
  assert.equal(shownProofKind('NOTE', undefined), 'NOTE')
})
