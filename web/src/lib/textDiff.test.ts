import assert from 'node:assert/strict'
import { test } from 'node:test'

import { diffWords } from './textDiff'

void test('marks the words an edit added and removed', () => {
  assert.deepEqual(diffWords('Very fast swap from monero', 'Very slow swap from monero to litecoin'), [
    { type: 'same', text: 'Very ' },
    { type: 'removed', text: 'fast' },
    { type: 'added', text: 'slow' },
    { type: 'same', text: ' swap from monero' },
    { type: 'added', text: ' to litecoin' },
  ])
})

void test('identical texts are one unchanged part', () => {
  assert.deepEqual(diffWords('Same text.', 'Same text.'), [{ type: 'same', text: 'Same text.' }])
})

void test('punctuation stays apart from the word next to it', () => {
  assert.deepEqual(diffWords('it went badly to the crib.', 'it went badly to the.'), [
    { type: 'same', text: 'it went badly to the' },
    { type: 'removed', text: ' crib' },
    { type: 'same', text: '.' },
  ])
})
