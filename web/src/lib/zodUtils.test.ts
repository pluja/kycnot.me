import assert from 'node:assert/strict'
import { test } from 'node:test'

import { stringListOfContactMethodsSchema, zodContactMethod, zodUrlOptionalProtocol } from './zodUtils'

// These values reach an href sink, so the scheme must be constrained. The
// regression guard is the javascript:// payload from the F-01 stored-XSS report.
const SCRIPT_CAPABLE_URLS = [
  'javascript://x.test/%0aalert(document.domain)',
  'javascript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'vbscript:msgbox(1)',
  'file:///etc/passwd',
]

void test('zodUrlOptionalProtocol rejects script-capable schemes', () => {
  for (const url of SCRIPT_CAPABLE_URLS) {
    assert.equal(zodUrlOptionalProtocol.safeParse(url).success, false, `should reject ${url}`)
  }
})

void test('zodUrlOptionalProtocol accepts http(s) and schemeless domains', () => {
  for (const url of ['example.com', 'https://sub.example.com/path', 'http://abcd.onion', 'site.i2p']) {
    assert.equal(zodUrlOptionalProtocol.safeParse(url).success, true, `should accept ${url}`)
  }
})

void test('zodContactMethod rejects script-capable schemes', () => {
  for (const url of SCRIPT_CAPABLE_URLS) {
    assert.equal(zodContactMethod.safeParse(url).success, false, `should reject ${url}`)
  }
})

void test('zodContactMethod accepts url, email, and phone', () => {
  assert.equal(zodContactMethod.safeParse('https://t.me/foo').success, true)
  assert.equal(zodContactMethod.safeParse('support@example.com').success, true)
  assert.equal(zodContactMethod.safeParse('+1 (234) 567 8900').success, true)
})

void test('stored contact methods parse back to themselves', () => {
  for (const stored of [
    'mailto:hi@example.com',
    'tel:+1 234 567 8900',
    'tel:+12345678900',
    'https://t.me/example',
  ]) {
    assert.equal(zodContactMethod.parse(stored), stored)
  }
})

void test('typed emails and phone numbers get their scheme', () => {
  assert.equal(zodContactMethod.parse('hi@example.com'), 'mailto:hi@example.com')
  assert.equal(zodContactMethod.parse('+1 234 567 8900'), 'tel:+1 234 567 8900')
})

void test('a contact list keeps a spaced phone number as one entry', () => {
  assert.deepEqual(stringListOfContactMethodsSchema.parse('+1 234 567 8900\r\nhi@example.com'), [
    'tel:+1 234 567 8900',
    'mailto:hi@example.com',
  ])
})
