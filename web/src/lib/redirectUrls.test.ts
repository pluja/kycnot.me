import assert from 'node:assert/strict'
import { test } from 'node:test'

import { makeLoginUrl, makeSafeRedirectUrl } from './redirectUrls'

const origin = 'https://kycnot.me'

void test('a return path stays on this site', () => {
  assert.equal(
    makeSafeRedirectUrl('/service/foo?tab=reviews#comments', origin),
    '/service/foo?tab=reviews#comments'
  )
  for (const hostile of [
    'https://evil.example/login',
    '//evil.example/login',
    '/\\evil.example',
    'javascript:alert(1)',
    'https://kycnot.me.evil.example/',
    'https://kycnot.me//evil.example',
    '/.//evil.example',
    '/..//evil.example',
    'https://kycnot.me/.//evil.example',
  ]) {
    assert.equal(makeSafeRedirectUrl(hostile, origin), '/', hostile)
  }
  assert.equal(makeSafeRedirectUrl(null, origin), '/')
})

void test('the login link carries only a path back', () => {
  const login = new URL(makeLoginUrl(new URL('https://kycnot.me/service/foo?x=1')), origin)
  assert.equal(login.searchParams.get('redirect'), '/service/foo?x=1')
})
