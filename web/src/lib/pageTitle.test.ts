import assert from 'node:assert/strict'
import { test } from 'node:test'

import { fitPageTitle, MAX_PAGE_TITLE_LENGTH, PAGE_TITLE_SUFFIX } from './pageTitle'

void test('picks the first candidate that fits the budget', () => {
  assert.equal(fitPageTitle(['a'.repeat(80), 'b'.repeat(50), 'c']), 'b'.repeat(50))
})

void test('falls back to the last candidate when none fit', () => {
  const candidates = ['a'.repeat(80), 'b'.repeat(70)]
  assert.equal(fitPageTitle(candidates), 'b'.repeat(70))
})

void test('handles an empty candidate list', () => {
  assert.equal(fitPageTitle([]), '')
})

void test('a title spending the whole budget still renders with the brand suffix', () => {
  // The budget exists so `<pageTitle> | KYCnot.me` survives SERP truncation,
  // which starts around 60-68 characters of mixed-case text.
  assert.ok(MAX_PAGE_TITLE_LENGTH + PAGE_TITLE_SUFFIX.length <= 68)
})

void test('the longest real service page title stays within budget', () => {
  // Longest public service name in production is 22 chars, longest category 14.
  const name = 'Trêvoid’s Crypto Swaps'
  const category = 'Other services'
  const title = fitPageTitle([
    `${name} Review: KYC Level 4 ${category} & Privacy Score`,
    `${name} Review: KYC Level 4 ${category}`,
    `${name} Review: KYC Level 4`,
    `${name} Review`,
  ])
  assert.ok(title.length <= MAX_PAGE_TITLE_LENGTH, `${String(title.length)} chars: ${title}`)
  assert.ok(title.includes('KYC'), 'must not degrade past the keyword-bearing forms')
})
