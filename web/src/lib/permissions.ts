import type { Capability } from '../constants/capabilities'

// Capability-based access control. To add a capability:
//   1. Define it in constants/capabilities.ts (auto-shows in the grant UI).
//   2. If it guards an /admin/* route, add it to adminRouteCapabilities below
//      (middleware enforces it; the dashboard card auto-filters by it).
//   3. Gate the action via defineProtectedAction({ permissions: { capability } }).
//   4. Gate inline UI via userCan / Astro.locals.userCan.
// `admin` is a superuser (passes everything). Most non-case surfaces still use
// the legacy admin/moderator booleans, so don't assume a surface is scoped.

type UserForPermissions = {
  admin: boolean
  capabilities: string[]
  moderator?: boolean
}

// Temporary bridge while the `moderator` boolean is decomposed into capabilities.
// Existing moderators keep their comment/contact powers until the column is
// dropped and these are persisted as real grants. Remove with the column.
const legacyModeratorCapabilities: Capability[] = ['comments:moderate', 'contact:manage']

export function userCan(user: UserForPermissions | null | undefined, capability: Capability): boolean {
  if (!user) return false
  if (user.admin) return true
  if (user.capabilities.includes(capability)) return true
  if (user.moderator && legacyModeratorCapabilities.includes(capability)) return true
  return false
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
