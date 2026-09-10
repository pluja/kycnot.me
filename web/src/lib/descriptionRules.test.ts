import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { checkDescription } from './descriptionRules'

type Fixture = { cases: { text: string; violations: string[] }[] }

const fixture = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../../pyworker/tests/fixtures/description_rules.json'), 'utf8')
) as Fixture

void test('checkDescription agrees with the shared fixture', () => {
  for (const { text, violations } of fixture.cases) {
    assert.deepEqual([...checkDescription(text)].sort(), [...violations].sort(), text)
  }
})

void test('a dot inside an abbreviation or a version is not a sentence end', () => {
  assert.deepEqual(checkDescription('Runs Bisq 2.1 and later, e.g. on Linux.'), [])
})
