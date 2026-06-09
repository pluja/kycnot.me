import { ContactCategory } from '@prisma/client'

import type { Capability } from '../constants/capabilities'

// Capability-based access control. To add a capability:
//   1. Define it in constants/capabilities.ts (auto-shows in the grant UI).
//   2. If it guards an /admin/* route, add it to adminRouteCapabilities below
//      (middleware enforces it; the dashboard card auto-filters by it).
//   3. Gate the action via defineProtectedAction({ permissions: { capability } }).
//   4. Gate inline UI via userCan / Astro.locals.userCan.
// `admin` is a superuser (passes every capability); everything else is
// capability-gated. `verified`/`spammer` remain separate user-state flags.

type UserForPermissions = {
  admin: boolean
  capabilities: string[]
}

export function userCan(user: UserForPermissions | null | undefined, capability: Capability): boolean {
  if (!user) return false
  if (user.admin) return true
  return user.capabilities.includes(capability)
}

// cap builds the action permission object, keeping the capability literal typed
// (a bare inline `{ capability: '...' }` widens to string and fails the guard).
export const cap = (capability: Capability) => ({ capability })

// Every admin route maps to the capabilities that unlock it; holding any one
// grants access. Routes absent from this list are superuser-only: a new /admin
// page is locked to admins until it is granted a capability here. This is the
// auditable, default-deny chokepoint enforced in middleware.
const adminRouteCapabilities = [
  { prefix: '/admin/cases', capabilities: ['cases:manage'] },
  { prefix: '/admin/comments', capabilities: ['comments:moderate'] },
  { prefix: '/admin/contact', capabilities: ['contact:manage', 'contact:manage-urgent'] },
  { prefix: '/admin/service-suggestions', capabilities: ['suggestions:manage'] },
  { prefix: '/admin/services', capabilities: ['services:edit'] },
  { prefix: '/admin/events', capabilities: ['events:manage'] },
  { prefix: '/admin/attributes', capabilities: ['attributes:manage'] },
  { prefix: '/admin/announcements', capabilities: ['announcements:manage'] },
  { prefix: '/admin/notifications', capabilities: ['notifications:manage'] },
  { prefix: '/admin/stats', capabilities: ['stats:view'] },
  { prefix: '/admin/users', capabilities: ['users:manage'] },
] as const satisfies {
  prefix: string
  capabilities: readonly Capability[]
}[]

// adminRouteRequiredCapabilities returns the capabilities that grant a non-admin
// access to the given admin path (holding any one is enough), or [] when the
// path is admin-only.
export function adminRouteRequiredCapabilities(pathname: string): readonly Capability[] {
  const match = adminRouteCapabilities
    .filter((route) => pathname === route.prefix || pathname.startsWith(`${route.prefix}/`))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0]

  return match?.capabilities ?? []
}

// userCanAccessAdmin is true for admins and for any user holding a capability
// that unlocks at least one admin route. Used to surface the admin entry point
// (header link + dashboard root) to scoped staff, not just superusers.
export function userCanAccessAdmin(user: UserForPermissions | null | undefined): boolean {
  if (!user) return false
  if (user.admin) return true
  return adminRouteCapabilities.some((route) =>
    route.capabilities.some((capability) => user.capabilities.includes(capability))
  )
}

// isStaff marks support-level staff (comment + service powers) for the public
// "Staff" badge. Admins are reported separately via their own badge.
export function isStaff(user: UserForPermissions | null | undefined): boolean {
  return userCan(user, 'comments:moderate') && userCan(user, 'services:edit')
}

// hasAnyCapability is true for any holder of at least one capability. The admin
// user list keys both its "Staff" filter and the per-row badge on this, so a
// scoped account (e.g. cases:manage only) never falls between the staff and
// regular buckets. The narrower isStaff drives the public-facing badge instead.
export function hasAnyCapability(user: UserForPermissions | null | undefined): boolean {
  return !!user && user.capabilities.length > 0
}

// contactCategoriesForUser returns which contact categories a user may manage.
// 'all' means unrestricted (admins and full contact:manage holders); a holder
// of only contact:manage-urgent is scoped to urgent service reports. Used to
// filter the contact queue and to re-check access on every contact mutation.
export function contactCategoriesForUser(
  user: UserForPermissions | null | undefined
): ContactCategory[] | 'all' {
  if (userCan(user, 'contact:manage')) return 'all'
  if (userCan(user, 'contact:manage-urgent')) return [ContactCategory.SERVICE_REPORT_URGENT]
  return []
}
