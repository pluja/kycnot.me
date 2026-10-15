import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { subDays } from 'date-fns'

import { trustUnlocksById } from '../constants/trustUnlocks'

import { computeTrustUnlocks, describeTrustRequirement, type TrustFacts } from './trust'

const now = new Date('2026-10-10T12:00:00Z')
const facts = (overrides: Partial<TrustFacts> = {}): TrustFacts => ({
  publishedPosts: 0,
  checkedProofPosts: 0,
  approvedSuggestions: 0,
  penalizingRejections: 0,
  spamRejections: 0,
  untrusted: false,
  commentsDisabled: false,
  ...overrides,
})

void test('an unlock needs both a fact and the account age', () => {
  assert.equal(computeTrustUnlocks(facts({ publishedPosts: 3 }), subDays(now, 29), now).displayName, false)
  assert.equal(computeTrustUnlocks(facts(), subDays(now, 60), now).displayName, false)
  assert.equal(computeTrustUnlocks(facts({ publishedPosts: 3 }), subDays(now, 30), now).displayName, true)
})

void test('the veteran badge accepts any one of its paths', () => {
  const old = subDays(now, 180)
  assert.equal(computeTrustUnlocks(facts({ publishedPosts: 19 }), old, now).veteranBadge, false)
  assert.equal(computeTrustUnlocks(facts({ publishedPosts: 20 }), old, now).veteranBadge, true)
  assert.equal(computeTrustUnlocks(facts({ checkedProofPosts: 5 }), old, now).veteranBadge, true)
  assert.equal(computeTrustUnlocks(facts({ approvedSuggestions: 5 }), old, now).veteranBadge, true)
  assert.equal(
    computeTrustUnlocks(facts({ approvedSuggestions: 5 }), subDays(now, 179), now).veteranBadge,
    false
  )
})

void test('requirements read as a sentence', () => {
  assert.equal(
    describeTrustRequirement(trustUnlocksById.displayName),
    '3 published posts, and an account at least 30 days old'
  )
  assert.equal(
    describeTrustRequirement(trustUnlocksById.veteranBadge),
    '5 posts with checked proof or 20 published posts or 5 approved suggestions, and an account at least 180 days old'
  )
})

void test('a penalty locks every unlock', () => {
  const old = subDays(now, 365)
  const active = facts({ publishedPosts: 30, checkedProofPosts: 10 })
  assert.equal(computeTrustUnlocks({ ...active, untrusted: true }, old, now).displayName, false)
  assert.equal(computeTrustUnlocks({ ...active, commentsDisabled: true }, old, now).websiteLink, false)
  assert.equal(computeTrustUnlocks(active, old, now).veteranBadge, true)
})

void test('the docs state the Veteran requirement the code enforces', () => {
  const docs = readFileSync(new URL('../pages/docs/trust.mdx', import.meta.url), 'utf8')
  const requirement = describeTrustRequirement(trustUnlocksById.veteranBadge)
  assert.ok(docs.includes(requirement.charAt(0).toUpperCase() + requirement.slice(1)))
})
