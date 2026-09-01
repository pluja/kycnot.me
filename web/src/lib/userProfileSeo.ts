import type { Prisma } from '@prisma/client'

/**
 * Affiliations to a service the public can actually reach. A profile whose
 * only link is to a hidden service is not a public presence.
 */
const PUBLICLY_VISIBLE_SERVICE = {
  serviceVisibility: { in: ['PUBLIC', 'ARCHIVED', 'UNLISTED'] },
} satisfies Prisma.ServiceWhereInput

/**
 * A profile earns indexing once it stands for a real, identifiable person on
 * the site: someone verified, or someone attached to a service.
 *
 * The `User` model has no bio, so a profile below this bar renders karma
 * widgets and empty-state placeholders around a machine-generated username.
 * Those pages were reaching Google through comment bylines and collecting
 * impressions with no clicks.
 *
 * Use with {@link isUserProfileIndexable}; the two are the query-side and
 * page-side views of one rule, and they previously disagreed because the
 * sitemap counted affiliations to hidden services and the page did not.
 */
export const indexableUserProfileWhere = {
  scheduledDeletionAt: null,
  OR: [{ verified: true }, { serviceAffiliations: { some: { service: PUBLICLY_VISIBLE_SERVICE } } }],
} satisfies Prisma.UserWhereInput

/**
 * Page-side counterpart of {@link indexableUserProfileWhere}.
 *
 * `serviceAffiliations` must already be filtered to publicly visible services
 * by the caller's `select`, which is how the profile page loads them.
 */
export function isUserProfileIndexable(user: {
  verified: boolean
  scheduledDeletionAt: Date | null
  serviceAffiliations: unknown[]
}): boolean {
  return user.scheduledDeletionAt === null && (user.verified || user.serviceAffiliations.length > 0)
}
