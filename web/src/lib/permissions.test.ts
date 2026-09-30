import assert from 'node:assert/strict'
import { test } from 'node:test'

import { capabilities, capabilityRequirements } from '../constants/capabilities'
import { capabilityPresets } from '../constants/capabilityPresets'

import {
  adminRouteRequiredCapabilities,
  canReviewSuggestion,
  contactCategoriesForUser,
  userCan,
  withoutOrphanCapabilities,
} from './permissions'

import type { Capability } from '../constants/capabilities'

const make = (admin: boolean, capabilities: string[]) => ({ admin, capabilities })

void test('admins manage all contact categories', () => {
  assert.equal(contactCategoriesForUser(make(true, [])), 'all')
})

void test('contact:manage manages all categories', () => {
  assert.equal(contactCategoriesForUser(make(false, ['contact:manage'])), 'all')
})

void test('contact:manage-urgent is scoped to urgent reports', () => {
  assert.deepEqual(contactCategoriesForUser(make(false, ['contact:manage-urgent'])), [
    'SERVICE_REPORT_URGENT',
  ])
})

void test('full manage outranks the urgent scope when both are held', () => {
  assert.equal(contactCategoriesForUser(make(false, ['contact:manage', 'contact:manage-urgent'])), 'all')
})

void test('no contact capability means no categories', () => {
  assert.deepEqual(contactCategoriesForUser(make(false, ['comments:moderate'])), [])
  assert.deepEqual(contactCategoriesForUser(null), [])
})

void test('contact route is unlocked by either contact capability', () => {
  assert.deepEqual(adminRouteRequiredCapabilities('/admin/contact'), [
    'contact:manage',
    'contact:manage-urgent',
  ])
  // Sub-paths match the same prefix.
  assert.deepEqual(adminRouteRequiredCapabilities('/admin/contact/42'), [
    'contact:manage',
    'contact:manage-urgent',
  ])
})

void test('single-capability routes are unchanged by the any-of widening', () => {
  assert.deepEqual(adminRouteRequiredCapabilities('/admin/cases'), ['cases:manage'])
  assert.deepEqual(adminRouteRequiredCapabilities('/admin/users/bob'), ['users:manage'])
})

void test('the most specific prefix wins (suggestions not shadowed by services)', () => {
  assert.deepEqual(adminRouteRequiredCapabilities('/admin/service-suggestions'), ['suggestions:manage'])
})

void test('unmapped admin paths are admin-only (no capabilities)', () => {
  assert.deepEqual(adminRouteRequiredCapabilities('/admin'), [])
  assert.deepEqual(adminRouteRequiredCapabilities('/admin/secret-dashboard'), [])
})

void test('a capability without its required parent grants nothing', () => {
  assert.equal(userCan(make(false, ['suggestions:self-apply']), 'suggestions:self-apply'), false)
})

void test('a capability with its required parent is granted', () => {
  assert.equal(
    userCan(make(false, ['suggestions:manage', 'suggestions:self-apply']), 'suggestions:self-apply'),
    true
  )
})

void test('admins hold every capability regardless of requirements', () => {
  assert.equal(userCan(make(true, []), 'suggestions:self-apply'), true)
})

void test('orphan grants are dropped before they are stored', () => {
  assert.deepEqual(withoutOrphanCapabilities(['suggestions:self-apply', 'comments:moderate']), [
    'comments:moderate',
  ])
  assert.deepEqual(withoutOrphanCapabilities(['suggestions:manage', 'suggestions:self-apply']), [
    'suggestions:manage',
    'suggestions:self-apply',
  ])
})

void test('every requirement names a real capability, with no cycles', () => {
  const known = new Set<string>(capabilities.map((capability) => capability.value))
  for (const [capability, requires] of Object.entries(capabilityRequirements)) {
    for (const required of requires) {
      assert.ok(known.has(required), `${capability} requires unknown ${required}`)
    }
    assert.equal(
      userCan(make(false, [...known]), capability as Capability),
      true,
      `${capability} is unreachable, likely a requirement cycle`
    )
  }
})

void test('every preset satisfies its own requirements', () => {
  for (const preset of capabilityPresets) {
    assert.deepEqual(withoutOrphanCapabilities([...preset.capabilities]), [...preset.capabilities], preset.id)
  }
})

const reviewer = (id: number, admin: boolean, capabilities: string[]) => ({ id, admin, capabilities })
const ownSuggestion = { userId: 7 }
const applying = { applyingFieldEdits: true }
const approvingByStatus = { applyingFieldEdits: false }

void test("anyone who reviews suggestions may review someone else's", () => {
  assert.equal(
    canReviewSuggestion(ownSuggestion, reviewer(8, false, ['suggestions:manage']), approvingByStatus),
    true
  )
})

void test('a moderator cannot review their own suggestion without self-apply', () => {
  assert.equal(
    canReviewSuggestion(ownSuggestion, reviewer(7, false, ['suggestions:manage']), applying),
    false
  )
})

void test('self-apply lets a moderator apply their own field edits', () => {
  const moderator = reviewer(7, false, ['suggestions:manage', 'suggestions:self-apply'])
  assert.equal(canReviewSuggestion(ownSuggestion, moderator, applying), true)
})

void test('self-apply never covers approving their own suggestion by status', () => {
  const moderator = reviewer(7, false, ['suggestions:manage', 'suggestions:self-apply'])
  assert.equal(canReviewSuggestion(ownSuggestion, moderator, approvingByStatus), false)
})

void test('self-apply without its parent does not lift the rule', () => {
  assert.equal(
    canReviewSuggestion(ownSuggestion, reviewer(7, false, ['suggestions:self-apply']), applying),
    false
  )
})

void test('admins may review their own suggestions', () => {
  assert.equal(canReviewSuggestion(ownSuggestion, reviewer(7, true, []), approvingByStatus), true)
})
