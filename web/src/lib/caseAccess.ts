import { CaseStatus, CaseVisibility } from '@prisma/client'

import { userCan } from './permissions'

type CaseAccessUser = { id: number; admin: boolean; capabilities: string[] } | null | undefined

type CaseForAccess = {
  reportedById: number | null
  participants: { id: number }[]
  service: { affiliatedUsers: { userId: number }[] }
}

const UNPUBLISHED_STATUSES: CaseStatus[] = [CaseStatus.DRAFT, CaseStatus.REJECTED]

export function isCaseStaff(user: CaseAccessUser): boolean {
  return userCan(user, 'cases:manage')
}

// isCasePublished reports whether a case is visible outside the staff. DRAFT and
// REJECTED cases stay staff-only; every other status is publicly reachable.
export function isCasePublished(status: CaseStatus): boolean {
  return !UNPUBLISHED_STATUSES.includes(status)
}

// Staff can always participate. Otherwise a user must be the reporter, an
// attached participant, or affiliated with the reported service.
export function canParticipateInCase(user: CaseAccessUser, caseRow: CaseForAccess): boolean {
  if (isCaseStaff(user)) return true
  if (!user) return false
  return (
    caseRow.reportedById === user.id ||
    caseRow.participants.some((participant) => participant.id === user.id) ||
    caseRow.service.affiliatedUsers.some((affiliation) => affiliation.userId === user.id)
  )
}

// caseVisibilityTiersFor returns the content tiers a viewer may read: staff see
// everything, participants see public and participant content, everyone else
// sees only public content.
export function caseVisibilityTiersFor(user: CaseAccessUser, caseRow: CaseForAccess): CaseVisibility[] {
  if (isCaseStaff(user)) return [CaseVisibility.PUBLIC, CaseVisibility.PARTICIPANTS, CaseVisibility.STAFF]
  if (canParticipateInCase(user, caseRow)) return [CaseVisibility.PUBLIC, CaseVisibility.PARTICIPANTS]
  return [CaseVisibility.PUBLIC]
}
