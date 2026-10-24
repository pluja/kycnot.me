import assert from 'node:assert/strict'
import { test } from 'node:test'

import { MAX_IMAGE_DIMENSION, validateImageParams } from './imageRequestValidation'

function check(query: string): string | null {
  return validateImageParams(new URLSearchParams(query))
}

void test('accepts the parameters Astro generates', () => {
  assert.equal(check('href=/files/x.png&w=1200&h=64&f=webp'), null)
  assert.equal(check('href=/files/logo.svg&f=webp'), null)
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

void test('accepts only the parameters the site image URLs carry', () => {
  assert.equal(check('href=/files/x.png&w=2400&h=1260&f=png'), null)
  assert.equal(check('href=/files/x.png&w=2733&h=1572&f=webp'), null)
  // quality turns on slow PNG palette quantization; fit, position and background change the output without being
  // part of the cache key.
  for (const extra of ['q=80', 'q=high', 'fit=fill', 'position=top', 'background=%23000000', 'unknown=1']) {
    assert.notEqual(check(`href=/files/x.png&w=96&f=webp&${extra}`), null)
  }
})

void test('accepts the href shapes Astro emits', () => {
  assert.equal(check('href=/files/services/pictures/135b5950cd.png'), null)
  assert.equal(check('href=/_astro/cover.abc123.png'), null)
  assert.equal(check('href=https://kycnot.me/files/x.png&w=96'), null)
})

void test('rejects malformed href before it can 500 the default endpoint', () => {
  assert.notEqual(check('w=96&h=96&f=webp'), null) // missing href
  assert.notEqual(check('href=&w=96'), null) // empty href
  assert.notEqual(check('href=a&w=96&h=96&f=webp'), null) // bare word
  assert.notEqual(check('href=kycnot.me/files/x.png&w=96'), null) // no scheme
  assert.notEqual(check('href=//evil.com/x&w=96'), null) // protocol-relative
  assert.notEqual(check('href=ftp://x/y&w=96'), null) // non-http scheme
})

void test('never outputs svg, so no markup is served from /_image', () => {
  assert.notEqual(check('href=/files/logo.svg&f=svg'), null)
  assert.notEqual(check('href=/files/x.png&f=svg'), null)
})

void test('never outputs avif, which costs far more CPU than webp', () => {
  assert.notEqual(check('href=/files/x.png&f=avif'), null)
})
