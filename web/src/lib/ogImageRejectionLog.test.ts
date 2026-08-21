import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createOgImageRejectionLogger } from './ogImageRejectionLog'

void test('rate-limits repeated rejection diagnostics and reports the suppressed count', () => {
  let now = 0
  const lines: string[] = []
  const log = createOgImageRejectionLogger({
    intervalMs: 60_000,
    now: () => now,
    warn: (message) => lines.push(message),
  })

  log('Using default card', 'Malformed JSON')
  for (let index = 0; index < 100; index++) {
    log('Using default card', 'Malformed JSON')
  }
  assert.deepEqual(lines, ['[ogimage] Using default card: Malformed JSON'])

  now = 60_000
  log('Using default card', 'Malformed JSON')
  assert.equal(lines.length, 2)
  assert.match(lines[1] ?? '', /100 similar requests suppressed/)

  log('Rejected request', 'Badge templates are not available from the public endpoint')
  assert.equal(lines.length, 3)
})

void test('groups invalid-prop rejections under one bounded key', () => {
  const lines: string[] = []
  const log = createOgImageRejectionLogger({
    now: () => 0,
    warn: (message) => lines.push(message),
  })

  for (let index = 0; index < 100; index++) {
    log(
      'Using default card',
      `Invalid props for "service": categories.${String(index)}.name: invalid_type`,
      'Invalid props for "service"'
    )
  }

  assert.equal(lines.length, 1)
})
