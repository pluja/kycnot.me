import assert from 'node:assert/strict'
import { test } from 'node:test'

import { listingCheckFieldSchemas } from './listingCheckFields'

test('a country read out of a document has to be a code the column can hold', () => {
  const schema = listingCheckFieldSchemas.registrationCountryCode

  // The column is two characters wide, so this is not a value it can take.
  assert.equal(schema.safeParse('British Virgin Islands').success, false)
  assert.equal(schema.safeParse('VG').success, true)
})

test('a company name is trimmed and bounded like the one a person types', () => {
  const schema = listingCheckFieldSchemas.registeredCompanyName

  assert.equal(schema.safeParse('  Acme Ltd  ').success && schema.parse('  Acme Ltd  '), 'Acme Ltd')
  assert.equal(schema.safeParse('x'.repeat(101)).success, false)
  assert.equal(schema.safeParse('').success, false)
})
