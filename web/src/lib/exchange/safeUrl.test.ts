/* eslint-disable @typescript-eslint/no-floating-promises */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { safeHttpUrl } from './safeUrl'

test('accepts http and https URLs', () => {
  assert.equal(safeHttpUrl('http://example.com/path?x=1'), 'http://example.com/path?x=1')
  assert.equal(safeHttpUrl('https://example.com/'), 'https://example.com/')
})

test('rejects javascript:, data:, vbscript:, file:, mailto:', () => {
  for (const raw of [
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'mailto:a@b.com',
  ]) {
    assert.equal(safeHttpUrl(raw), null, `expected ${raw} to be rejected`)
  }
})

test('rejects malformed URLs and empty input', () => {
  assert.equal(safeHttpUrl(''), null)
  assert.equal(safeHttpUrl(null), null)
  assert.equal(safeHttpUrl(undefined), null)
  assert.equal(safeHttpUrl('not a url'), null)
  assert.equal(safeHttpUrl('http://[invalid'), null)
})

test('rejects relative paths', () => {
  assert.equal(safeHttpUrl('/just/a/path'), null)
  assert.equal(safeHttpUrl('./foo'), null)
})
