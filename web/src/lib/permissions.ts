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

// Every admin route maps to the single capability that unlocks it. Routes
// absent from this list are superuser-only: a new /admin page is locked to
// admins until it is granted a capability here. This is the auditable,
// default-deny chokepoint enforced in middleware.
const adminRouteCapabilities = [
  { prefix: '/admin/cases', capability: 'cases:manage' },
  { prefix: '/admin/comments', capability: 'comments:moderate' },
  { prefix: '/admin/contact', capability: 'contact:manage' },
  { prefix: '/admin/service-suggestions', capability: 'suggestions:manage' },
  { prefix: '/admin/services', capability: 'services:edit' },
  { prefix: '/admin/events', capability: 'events:manage' },
  { prefix: '/admin/attributes', capability: 'attributes:manage' },
  { prefix: '/admin/announcements', capability: 'announcements:manage' },
  { prefix: '/admin/notifications', capability: 'notifications:manage' },
  { prefix: '/admin/stats', capability: 'stats:view' },
  { prefix: '/admin/users', capability: 'users:manage' },
] as const satisfies {
  prefix: string
  capability: Capability
}[]

// adminRouteRequiredCapability returns the capability that grants a non-admin
// access to the given admin path, or null when the path is admin-only.
export function adminRouteRequiredCapability(pathname: string): Capability | null {
  const match = adminRouteCapabilities
    .filter((route) => pathname === route.prefix || pathname.startsWith(`${route.prefix}/`))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0]

  return match?.capability ?? null
}

// userCanAccessAdmin is true for admins and for any user holding a capability
// that unlocks at least one admin route. Used to surface the admin entry point
// (header link + dashboard root) to scoped staff, not just superusers.
export function userCanAccessAdmin(user: UserForPermissions | null | undefined): boolean {
  if (!user) return false
  if (user.admin) return true
  return adminRouteCapabilities.some((route) => user.capabilities.includes(route.capability))
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
