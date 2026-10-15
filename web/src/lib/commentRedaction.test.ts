import assert from 'node:assert/strict'
import { test } from 'node:test'

import { commentContentHash, commentRedactionInput, isValidRedaction } from './commentRedaction'

const validRedaction = {
  commentId: 1,
  version: 2,
  sourceHash: commentContentHash('Contact me at private@example.test.'),
  content: 'Contact details [removed].',
  reason: 'Removed an email address.',
}

void test('text removal accepts current posts and explicit history versions', () => {
  assert.equal(commentRedactionInput.parse(validRedaction).revisionId, undefined)
  assert.equal(commentRedactionInput.parse({ ...validRedaction, revisionId: '3' }).revisionId, 3)
  assert.equal(
    commentRedactionInput.parse({ ...validRedaction, content: '  Text [removed].  ' }).content,
    'Text [removed].'
  )
})

void test('text removal requires a bounded replacement, a reason and a source fingerprint', () => {
  for (const invalid of [
    { content: '' },
    { content: 'x'.repeat(2001) },
    { reason: '' },
    { reason: 'x'.repeat(501) },
    { sourceHash: '' },
    { sourceHash: 'malformed' },
    { version: 0 },
    { commentId: -1 },
    { revisionId: 'another-post' },
    { revisionId: '' },
  ]) {
    assert.equal(commentRedactionInput.safeParse({ ...validRedaction, ...invalid }).success, false)
  }
})

void test('source fingerprints distinguish exact text, including whitespace and unicode', () => {
  const source = 'Private reference: αβγ'
  assert.equal(commentContentHash(source), commentContentHash(source))
  assert.notEqual(commentContentHash(source), commentContentHash(`${source} `))
  assert.notEqual(commentContentHash(source), commentContentHash('Private reference: [removed]'))
})

void test('redaction only swaps stretches of the original for the marker', () => {
  const original = 'Contact me at private@example.test or on the forum.'
  assert.equal(isValidRedaction(original, 'Contact me at [removed] or on the forum.'), true)
  assert.equal(isValidRedaction(original, '[removed] or on the forum.'), true)
  assert.equal(isValidRedaction(original, 'Contact me at [removed] or on [removed].'), true)
  assert.equal(isValidRedaction(original, '[Removed by moderation]'), true)
})

void test('redaction rejects rewritten, reordered, unchanged or unmarked text', () => {
  const original = 'Contact me at private@example.test or on the forum.'
  assert.equal(isValidRedaction(original, original), false)
  assert.equal(isValidRedaction(original, 'Contact me at [removed] or on the website.'), false)
  assert.equal(isValidRedaction(original, 'on the forum [removed] Contact me at.'), false)
  assert.equal(isValidRedaction(original, 'Written by a moderator instead.'), false)
  assert.equal(isValidRedaction('[Removed by moderation]', '[Removed by moderation]'), false)
  assert.equal(isValidRedaction('Keep [removed] here, please.', 'Keep [removed] here, please.'), false)
})
