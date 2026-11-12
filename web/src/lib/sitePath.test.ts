import assert from 'node:assert/strict'
import { test } from 'node:test'

import { resolveSitePath } from './sitePath'

const origin = 'https://kycnot.me'

void test('resolves an ordinary path on the origin', () => {
  assert.equal(resolveSitePath('/service/foo', origin), 'https://kycnot.me/service/foo')
  assert.equal(resolveSitePath('/', origin), 'https://kycnot.me/')
})

void test('keeps a path that opens with slashes on the origin', () => {
  assert.equal(resolveSitePath('//evil.example/x', origin), 'https://kycnot.me/evil.example/x')
  assert.equal(resolveSitePath('///evil.example', origin), 'https://kycnot.me/evil.example')
  assert.equal(resolveSitePath('/\\evil.example', origin), 'https://kycnot.me/evil.example')
  assert.equal(resolveSitePath('\\\\evil.example', origin), 'https://kycnot.me/evil.example')
})

void test('keeps whitespace-padded slashes on the origin', () => {
  assert.equal(resolveSitePath('\t//evil.example', origin), 'https://kycnot.me/evil.example')
  assert.equal(resolveSitePath(' //evil.example', origin), 'https://kycnot.me/evil.example')
  assert.equal(resolveSitePath('/\t/evil.example', origin), 'https://kycnot.me/evil.example')
  assert.equal(resolveSitePath('\n/\n/evil.example', origin), 'https://kycnot.me/evil.example')
})

void test('leaves full URLs, queries and fragments as they were', () => {
  assert.equal(resolveSitePath('https://example.org/a', origin), 'https://example.org/a')
  assert.equal(resolveSitePath('/a?b=1#c', origin), 'https://kycnot.me/a?b=1#c')
})

void test('does not throw on an encoded traversal probe', () => {
  assert.equal(resolveSitePath('//%2e%2e%2f%2eenv', origin), 'https://kycnot.me/%2e%2e%2f%2eenv')
})
