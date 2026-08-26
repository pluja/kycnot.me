import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isValidOgImageSignature, signOgImageData } from './ogImageSignature'

const SECRET = 'a'.repeat(32)
const DATA = JSON.stringify({ template: 'generic', title: 'Events' })

void test('accepts data carrying the signature this secret produces', () => {
  assert.equal(isValidOgImageSignature(SECRET, DATA, signOgImageData(SECRET, DATA)), true)
})

void test('rejects a missing, empty, or truncated signature', () => {
  const signature = signOgImageData(SECRET, DATA)

  assert.equal(isValidOgImageSignature(SECRET, DATA, null), false)
  assert.equal(isValidOgImageSignature(SECRET, DATA, ''), false)
  assert.equal(isValidOgImageSignature(SECRET, DATA, signature.slice(0, -1)), false)
  assert.equal(isValidOgImageSignature(SECRET, DATA, `${signature}x`), false)
})

void test('rejects a signature lifted from different data or a different secret', () => {
  const forged = JSON.stringify({ template: 'generic', title: 'Bisq is a scam' })

  assert.equal(isValidOgImageSignature(SECRET, forged, signOgImageData(SECRET, DATA)), false)
  assert.equal(isValidOgImageSignature(SECRET, DATA, signOgImageData('b'.repeat(32), DATA)), false)
})

void test('signs deterministically and url-safely', () => {
  const signature = signOgImageData(SECRET, DATA)

  assert.equal(signature, signOgImageData(SECRET, DATA))
  assert.match(signature, /^[\w-]{43}$/)
  assert.equal(encodeURIComponent(signature), signature)
})
