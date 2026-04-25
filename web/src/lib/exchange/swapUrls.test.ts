/* eslint-disable @typescript-eslint/no-floating-promises */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildSwapUrl } from './swapUrls'

test('encodes sendAmount only', () => {
  const got = buildSwapUrl('btc', 'xmr', { sendAmount: 0.02 })
  assert.equal(got, '/swap?from=btc&to=xmr&sendAmount=0.02')
})

test('encodes receiveAmount only (fixes the no-JS drop-state regression)', () => {
  const got = buildSwapUrl('btc', 'xmr', { receiveAmount: 1.5 })
  assert.equal(got, '/swap?from=btc&to=xmr&receiveAmount=1.5')
})

test('sendAmount wins when both are set', () => {
  const got = buildSwapUrl('btc', 'xmr', { sendAmount: 0.02, receiveAmount: 1.5 })
  assert.equal(got, '/swap?from=btc&to=xmr&sendAmount=0.02')
})

test('omits both amounts when neither is set', () => {
  const got = buildSwapUrl('btc', 'xmr')
  assert.equal(got, '/swap?from=btc&to=xmr')
})

test('URL-encodes currency slugs with special characters', () => {
  const got = buildSwapUrl('btc', 'usdt@trc20', { sendAmount: 0.02 })
  const parsed = new URL('http://x' + got)
  assert.equal(parsed.searchParams.get('to'), 'usdt@trc20')
  assert.equal(parsed.searchParams.get('sendAmount'), '0.02')
})

test('encodes sort and approved-only filters', () => {
  const got = buildSwapUrl('btc', 'xmr', { sortBy: 'score', approvedOnly: true })
  assert.equal(got, '/swap?from=btc&to=xmr&sortBy=score&approvedOnly=true')
})
