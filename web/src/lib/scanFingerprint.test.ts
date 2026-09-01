import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { scanFingerprint } from './scanFingerprint'

type FixtureRow = {
  serviceId: number
  kind: string
  key: string
  expected: string
}

const rows: FixtureRow[] = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../../pyworker/tests/fixtures/scan_fingerprints.json'), 'utf8')
)

function rowAt(index: number) {
  const row = rows[index]
  if (!row) throw new Error(`fixture row ${index} is missing`)
  return row
}

const digest = (row: FixtureRow) => scanFingerprint(row.serviceId, row.kind, row.key)

test('scanFingerprint matches the digests pyworker produces', () => {
  // The same table pyworker runs. Either side drifting fails a test rather
  // than silently resurrecting declined proposals.
  assert.ok(rows.length > 0)
  for (const row of rows) {
    assert.equal(digest(row), row.expected, `${row.kind} ${row.key}`)
  }
})

test('scanFingerprint ignores surrounding whitespace in the key', () => {
  assert.equal(digest(rowAt(4)), digest(rowAt(0)))
})

test('scanFingerprint separates kinds, services and keys', () => {
  const base = digest(rowAt(0))

  for (const index of [1, 2, 3]) {
    assert.notEqual(digest(rowAt(index)), base)
  }
})
