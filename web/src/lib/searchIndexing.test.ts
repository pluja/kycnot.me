import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isIndexableSearch } from './searchIndexing'

const indexable = (search: string, { query = '', shownCount = 10 } = {}) =>
  isIndexableSearch({ canonicalParams: new URLSearchParams(search), query, shownCount })

void test('indexes the home page and its pages', () => {
  assert.equal(indexable(''), true)
  assert.equal(indexable('page=3'), true)
})

void test('indexes the shapes the search sitemap emits', () => {
  assert.equal(indexable('categories=vpn'), true)
  assert.equal(indexable('currencies=xmr'), true)
  assert.equal(indexable('max-kyc=0'), true)
  assert.equal(indexable('categories=vpn&currencies=xmr&max-kyc=0'), true)
  assert.equal(indexable('categories=vpn&currencies=btc&currencies=xmr&currency-mode=and'), true)
  assert.equal(indexable('attr-12=yes'), true)
  assert.equal(indexable('attr-12=yes&page=2'), true)
})

void test('keeps empty results and free-text searches out of the index', () => {
  assert.equal(indexable('categories=vpn', { shownCount: 0 }), false)
  assert.equal(indexable('page=99', { shownCount: 0 }), false)
  assert.equal(indexable('', { query: 'mullvad' }), false)
})

void test('keeps deeper filter combinations out of the index', () => {
  assert.equal(indexable('categories=vpn&categories=vps'), false)
  assert.equal(indexable('verification=community'), false)
  assert.equal(indexable('max-kyc=2'), false)
  assert.equal(indexable('networks=onion'), false)
  assert.equal(indexable('min-score=7'), false)
  assert.equal(indexable('currencies=btc&currencies=cash&currency-mode=and'), false)
  assert.equal(indexable('currencies=btc&currencies=xmr'), false)
  assert.equal(indexable('attr-12=no'), false)
  assert.equal(indexable('attr-12=yes&attr-13=yes'), false)
  assert.equal(indexable('attr-12=yes&categories=vpn'), false)
})
