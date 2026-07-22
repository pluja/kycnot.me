import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isPublicUploadSubpath } from './uploadAccess'

void test('allows the public upload subtrees', () => {
  assert.equal(isPublicUploadSubpath('services/pictures/x.png'), true)
  assert.equal(isPublicUploadSubpath('users/pictures/12/x.png'), true)
  assert.equal(isPublicUploadSubpath('evidence/trocador/x.png'), true)
})

void test('denies the private cases subtree', () => {
  assert.equal(isPublicUploadSubpath('cases/1/x.png'), false)
})

void test('denies traversal that resolves into a private subtree', () => {
  // The bypass the substring check missed: textually starts with a public
  // prefix, but normalizes into cases/.
  assert.equal(isPublicUploadSubpath('evidence/../cases/1/x.png'), false)
  assert.equal(isPublicUploadSubpath('services/../cases/1/x.png'), false)
  assert.equal(isPublicUploadSubpath('users/../../cases/1/x.png'), false)
})

void test('denies escaping, absolute, and unknown subtrees', () => {
  assert.equal(isPublicUploadSubpath('../secret'), false)
  assert.equal(isPublicUploadSubpath('/etc/passwd'), false)
  assert.equal(isPublicUploadSubpath('cases/../evidence/x.png'), true) // resolves to a public subtree, safe
  assert.equal(isPublicUploadSubpath('secrets/x.png'), false)
  assert.equal(isPublicUploadSubpath(''), false)
})
