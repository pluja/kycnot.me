import assert from 'node:assert/strict'
import { test } from 'node:test'

import { confineToRoot } from './confinePath'

void test('resolves a relative child inside the root', () => {
  assert.equal(confineToRoot('/app/uploads', 'services/x.png'), '/app/uploads/services/x.png')
  assert.equal(
    confineToRoot('/app/dist/client', '_astro/cover.hash.webp'),
    '/app/dist/client/_astro/cover.hash.webp'
  )
})

void test('returns the root itself unchanged', () => {
  assert.equal(confineToRoot('/app/uploads', ''), '/app/uploads')
  assert.equal(confineToRoot('/app/uploads', '.'), '/app/uploads')
})

void test('rejects traversal out of the root', () => {
  assert.equal(confineToRoot('/app/uploads', '../secrets/x.png'), null)
  assert.equal(confineToRoot('/app/uploads', 'services/../../cases/x.png'), null)
  assert.equal(confineToRoot('/app/dist/client', '../server/entry.mjs'), null)
})

void test('rejects an absolute child that lands outside the root', () => {
  assert.equal(confineToRoot('/app/uploads', '/etc/passwd'), null)
  assert.equal(confineToRoot('/app/dist/client', '/app/uploads/services/x.png'), null)
})

void test('accepts an absolute child already inside the root', () => {
  assert.equal(confineToRoot('/app/uploads', '/app/uploads/services/x.png'), '/app/uploads/services/x.png')
})

void test('does not treat a sibling with a shared prefix as inside', () => {
  assert.equal(confineToRoot('/app/uploads', '../uploads-backup/x.png'), null)
  assert.equal(confineToRoot('/app/up', '/app/uploads/x.png'), null)
})

void test('normalizes the root so an unusual one does not fail every input closed', () => {
  assert.equal(confineToRoot('/app/uploads/', 'services/x.png'), '/app/uploads/services/x.png')
  assert.equal(confineToRoot('/app/./uploads', 'services/x.png'), '/app/uploads/services/x.png')
  assert.equal(confineToRoot('/app/media/../uploads', 'services/x.png'), '/app/uploads/services/x.png')
})

void test('still confines when the root is unusual', () => {
  assert.equal(confineToRoot('/app/uploads/', '../cases/x.png'), null)
  assert.equal(confineToRoot('/app/./uploads', '/etc/passwd'), null)
})
