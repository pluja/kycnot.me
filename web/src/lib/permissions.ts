import type { Capability } from '../constants/capabilities'

type UserForPermissions = {
  admin: boolean
  capabilities: string[]
}

export function userCan(user: UserForPermissions | null | undefined, capability: Capability): boolean {
  if (!user) return false
  if (user.admin) return true
  return user.capabilities.includes(capability)
}

// Every admin route maps to the single capability that unlocks it. Routes
// absent from this list are superuser-only: a new /admin page is locked to
// admins until it is granted a capability here. This is the auditable,
// default-deny chokepoint enforced in middleware.
const adminRouteCapabilities = [{ prefix: '/admin/cases', capability: 'cases:manage' }] as const satisfies {
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
