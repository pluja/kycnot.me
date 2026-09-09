import assert from 'node:assert/strict'
import { test } from 'node:test'

import { fitSentences } from './metaDescription'

void test('keeps whole sentences while they fit', () => {
  assert.equal(fitSentences(['One two.', 'Three four.', 'Five six.'], 20), 'One two. Three four.')
})

void test('picks the longest variant that fits', () => {
  assert.equal(
    fitSentences([['A very long first sentence.', 'A short one.'], 'Tail.'], 20),
    'A short one. Tail.'
  )
})

void test('stops at the first slot that fits in no variant', () => {
  assert.equal(fitSentences(['Lead.', 'This one is far too long.', 'Tail.'], 12), 'Lead.')
})

void test('skips empty slots', () => {
  assert.equal(fitSentences([null, 'Lead.', undefined, 'Tail.'], 20), 'Lead. Tail.')
})
