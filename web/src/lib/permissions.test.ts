import assert from 'node:assert/strict'
import { test } from 'node:test'

import { adminRouteRequiredCapabilities, contactCategoriesForUser } from './permissions'

const make = (admin: boolean, capabilities: string[]) => ({ admin, capabilities })

test('admins manage all contact categories', () => {
  assert.equal(contactCategoriesForUser(make(true, [])), 'all')
})

test('contact:manage manages all categories', () => {
  assert.equal(contactCategoriesForUser(make(false, ['contact:manage'])), 'all')
})

test('contact:manage-urgent is scoped to urgent reports', () => {
  assert.deepEqual(contactCategoriesForUser(make(false, ['contact:manage-urgent'])), [
    'SERVICE_REPORT_URGENT',
  ])
})

test('full manage outranks the urgent scope when both are held', () => {
  assert.equal(
    contactCategoriesForUser(make(false, ['contact:manage', 'contact:manage-urgent'])),
    'all'
  )
})

test('no contact capability means no categories', () => {
  assert.deepEqual(contactCategoriesForUser(make(false, ['comments:moderate'])), [])
  assert.deepEqual(contactCategoriesForUser(null), [])
})

test('contact route is unlocked by either contact capability', () => {
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

test('single-capability routes are unchanged by the any-of widening', () => {
  assert.deepEqual(adminRouteRequiredCapabilities('/admin/cases'), ['cases:manage'])
  assert.deepEqual(adminRouteRequiredCapabilities('/admin/users/bob'), ['users:manage'])
})

test('the most specific prefix wins (suggestions not shadowed by services)', () => {
  assert.deepEqual(adminRouteRequiredCapabilities('/admin/service-suggestions'), [
    'suggestions:manage',
  ])
})

test('unmapped admin paths are admin-only (no capabilities)', () => {
  assert.deepEqual(adminRouteRequiredCapabilities('/admin'), [])
  assert.deepEqual(adminRouteRequiredCapabilities('/admin/secret-dashboard'), [])
})
