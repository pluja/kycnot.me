import assert from 'node:assert/strict'
import { test } from 'node:test'

import { LruByteCache } from './lruByteCache'

test('stores and retrieves entries within budget', () => {
  const cache = new LruByteCache<string>(100, 50)
  cache.set('a', 'A', 10)
  assert.equal(cache.get('a'), 'A')
  assert.equal(cache.bytes, 10)
})

test('evicts least-recently-used entries once over budget', () => {
  const cache = new LruByteCache<string>(30, 30)
  cache.set('a', 'A', 10)
  cache.set('b', 'B', 10)
  cache.set('c', 'C', 10)
  cache.get('a') // refresh a; b is now oldest
  cache.set('d', 'D', 10)
  assert.equal(cache.get('b'), undefined)
  assert.equal(cache.get('a'), 'A')
  assert.equal(cache.get('d'), 'D')
  assert.equal(cache.bytes, 30)
})

test('rejects entries above the per-entry cap', () => {
  const cache = new LruByteCache<string>(100, 20)
  cache.set('big', 'B', 21)
  assert.equal(cache.get('big'), undefined)
  assert.equal(cache.size, 0)
})

test('replacing a key updates the byte accounting', () => {
  const cache = new LruByteCache<string>(100, 50)
  cache.set('a', 'A1', 10)
  cache.set('a', 'A2', 30)
  assert.equal(cache.get('a'), 'A2')
  assert.equal(cache.bytes, 30)
  assert.equal(cache.size, 1)
})

test('a flood of distinct keys stays within the byte budget', () => {
  const cache = new LruByteCache<string>(50, 50)
  for (let i = 0; i < 1000; i++) {
    cache.set(`key-${i}`, 'V', 10)
  }
  assert.equal(cache.bytes <= 50, true)
  assert.equal(cache.size, 5)
})
