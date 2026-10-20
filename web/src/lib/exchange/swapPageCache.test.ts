/* eslint-disable @typescript-eslint/no-floating-promises */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { getCachedSwapPage, isStorableSwapResponse, storeSwapPage, swapPageCacheKey } from './swapPageCache'

const key = (path: string) => swapPageCacheKey(new URL(path, 'https://kycnot.me'))

test('swapPageCacheKey sorts the swap parameters into one key', () => {
  assert.equal(key('/swap?to=xmr&from=btc&sendAmount=0.01'), key('/swap?from=btc&sendAmount=0.01&to=xmr'))
  assert.equal(key('/swap'), '')
  assert.equal(key('/swap/?from=btc&to=xmr'), key('/swap?from=btc&to=xmr'))
  assert.equal(key('/swap?from=BTC&to=XMR'), key('/swap?from=btc&to=xmr'))
})

test('swapPageCacheKey refuses other pages and parameters that change the render', () => {
  assert.equal(key('/swapper?from=btc'), null)
  assert.equal(key('/swap?from=btc&to=xmr&success=planted'), null)
  assert.equal(key('/swap?from=btc&to=xmr&error=planted'), null)
  assert.equal(key('/swap?from=btc&from=eth&to=xmr'), null)
})

const page = (headers: Record<string, string>, status = 200) =>
  new Response('<html></html>', { status, headers })
const publicHtml = { 'Cache-Control': 'public, max-age=60', 'Content-Type': 'text/html' }

test('isStorableSwapResponse only accepts public HTML pages', () => {
  assert.equal(isStorableSwapResponse(page(publicHtml)), true)
  assert.equal(isStorableSwapResponse(page(publicHtml, 404)), false)
  assert.equal(isStorableSwapResponse(page({ ...publicHtml, 'Cache-Control': 'private, no-store' })), false)
  assert.equal(isStorableSwapResponse(page({ ...publicHtml, 'Content-Type': 'application/json' })), false)
})

test('a stored page is served until it expires', async () => {
  const now = 1_000_000
  storeSwapPage(
    'from=btc&to=xmr',
    '<p>cached</p>',
    new Headers({ ...publicHtml, 'Content-Length': '13' }),
    now
  )

  const hit = getCachedSwapPage('from=btc&to=xmr', now + 1000)
  assert.ok(hit)
  assert.equal(await hit.text(), '<p>cached</p>')
  assert.equal(hit.headers.get('Cache-Control'), 'public, max-age=60')
  assert.equal(hit.headers.get('Content-Length'), null)

  assert.equal(getCachedSwapPage('from=btc&to=xmr', now + 5 * 60_000), null)
  assert.equal(getCachedSwapPage('from=eth&to=xmr', now), null)
})
