/* eslint-disable @typescript-eslint/no-floating-promises */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { CANONICAL_SUPPORTED_CURRENCIES } from './fixtures/canonicalSupportedCurrencies'
import {
  buildCanonical,
  formatCurrencyLabel,
  lookupLabel,
  POPULAR_SWAP_PAIRS,
  resolveSwapPair,
  SWAP_CHIPS_PAIRS,
} from './swapPageInfoCore'

test('resolveSwapPair returns null for missing params', () => {
  assert.equal(resolveSwapPair(new URLSearchParams('')), null)
  assert.equal(resolveSwapPair(new URLSearchParams('from=btc')), null)
  assert.equal(resolveSwapPair(new URLSearchParams('to=xmr')), null)
})

test('resolveSwapPair returns null for self-pair', () => {
  assert.equal(resolveSwapPair(new URLSearchParams('from=btc&to=btc')), null)
})

test('resolveSwapPair returns null for uncurated pair', () => {
  assert.equal(resolveSwapPair(new URLSearchParams('from=foo&to=bar')), null)
})

test('resolveSwapPair lowercases and accepts curated pair', () => {
  const got = resolveSwapPair(new URLSearchParams('from=BTC&to=XMR'))
  assert.deepEqual(got, { from: 'btc', to: 'xmr' })
})

test('buildCanonical returns /swap for null pair', () => {
  assert.equal(buildCanonical(null), '/swap')
})

test('buildCanonical echoes the curated pair', () => {
  assert.equal(buildCanonical({ from: 'btc', to: 'xmr' }), '/swap?from=btc&to=xmr')
})

test('every POPULAR_SWAP_PAIRS slug resolves via lookupLabel', () => {
  for (const pair of POPULAR_SWAP_PAIRS) {
    for (const slug of [pair.from, pair.to]) {
      const label = lookupLabel(slug)
      assert.ok(label.code, `lookupLabel(${slug}) returned empty code`)
      assert.ok(label.name, `lookupLabel(${slug}) returned empty name`)
      assert.ok(
        formatCurrencyLabel(slug).length > 0,
        `formatCurrencyLabel(${slug}) produced empty string`
      )
    }
  }
})

test('every SWAP_CHIPS_PAIRS entry is in POPULAR_SWAP_PAIRS', () => {
  const popular = new Set(POPULAR_SWAP_PAIRS.map((p) => `${p.from}|${p.to}`))
  for (const pair of SWAP_CHIPS_PAIRS) {
    assert.ok(
      popular.has(`${pair.from}|${pair.to}`),
      `chip pair ${pair.from}->${pair.to} missing from POPULAR_SWAP_PAIRS`
    )
  }
})

test('every POPULAR_SWAP_PAIRS slug is supported by the aggregator (drift guard)', () => {
  const supported = new Set(CANONICAL_SUPPORTED_CURRENCIES)
  for (const pair of POPULAR_SWAP_PAIRS) {
    for (const slug of [pair.from, pair.to]) {
      assert.ok(
        supported.has(slug),
        `${slug} appears in POPULAR_SWAP_PAIRS but is not in the backend fallback currency list; update either the SEO pair list or web/src/lib/exchange/fixtures/canonicalSupportedCurrencies.ts`
      )
    }
  }
})
