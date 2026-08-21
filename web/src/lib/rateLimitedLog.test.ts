import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createRateLimitedLogger } from './rateLimitedLog'

void test('bounds retained keys and evicts the least recently used key', () => {
  const lines: string[] = []
  const log = createRateLimitedLogger({
    maxKeys: 2,
    now: () => 0,
    warn: (message) => lines.push(message),
  })

  log('a', 'a')
  log('b', 'b')
  log('a', 'a')
  log('c', 'c')
  log('a', 'a')
  log('b', 'b')

  assert.deepEqual(lines, ['a', 'b', 'c', 'b'])
})
