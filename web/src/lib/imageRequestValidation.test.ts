import assert from 'node:assert/strict'
import { test } from 'node:test'

import { MAX_IMAGE_DIMENSION, validateImageParams } from './imageRequestValidation'

function check(query: string): string | null {
  return validateImageParams(new URLSearchParams(query))
}

void test('accepts the parameters Astro generates', () => {
  assert.equal(check('href=/files/x.png&w=1200&h=64&f=webp&q=80'), null)
  assert.equal(check('href=/files/logo.svg&f=svg'), null)
  assert.equal(check('href=/files/x.png&q=high'), null)
  assert.equal(check('href=/files/x.png'), null)
  assert.equal(check(`href=/files/x.png&w=${MAX_IMAGE_DIMENSION.toString()}`), null)
})

void test('rejects oversized dimensions (the reported DoS payloads)', () => {
  assert.notEqual(check('href=/files/x.png&w=23589273'), null)
  assert.notEqual(check(`href=/files/x.png&w=${(MAX_IMAGE_DIMENSION + 1).toString()}`), null)
  assert.notEqual(check('href=/files/x.png&h=999999'), null)
})

void test('rejects scientific-notation values that parseInt would blow up', () => {
  // Number("40960000e-4") is 4096 (in range) but Astro's parseURL uses
  // parseInt("40960000e-4") = 40960000, so validating with Number() would
  // reopen the DoS. parsedIntInRange sees the large mantissa and rejects it.
  assert.notEqual(check('href=/files/x.png&w=40960000e-4'), null)
  assert.notEqual(check('href=/files/x.png&h=81920000e-4'), null)
})

void test('rejects non-positive and unparseable dimensions', () => {
  assert.notEqual(check('href=/files/x.png&w=-1'), null)
  assert.notEqual(check('href=/files/x.png&w=0'), null)
  assert.notEqual(check('href=/files/x.png&w='), null)
  assert.notEqual(check('href=/files/x.png&w=abc'), null)
})

void test('parses dimensions the way Astro does (parseInt truncation)', () => {
  // Astro's parseURL yields parseInt("1200.5") = 1200, a valid width, so the
  // validator must agree rather than reject.
  assert.equal(check('href=/files/x.png&w=1200.5'), null)
})

void test('rejects formats Astro never encodes, including gif', () => {
  assert.notEqual(check('href=/files/x.png&f=exe'), null)
  assert.notEqual(check('href=/files/x.png&f=gif'), null)
  assert.notEqual(check('href=/files/x.png&f='), null)
})

void test('rejects out-of-range quality', () => {
  assert.notEqual(check('href=/files/x.png&q=0'), null)
  assert.notEqual(check('href=/files/x.png&q=101'), null)
  assert.notEqual(check('href=/files/x.png&q=abc'), null)
})

void test('allows position and background params that Astro can emit', () => {
  // These are legitimate Astro transform params (e.g. background to flatten a
  // transparent PNG). They are not a DoS vector, so validation must not reject
  // them or it would 400 a site-generated URL.
  assert.equal(check('href=/files/x.png&w=100&h=100&fit=cover&position=top'), null)
  assert.equal(check('href=/files/x.png&background=%23ffffff'), null)
})
