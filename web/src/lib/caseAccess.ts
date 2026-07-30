import { CaseStatus, CaseVisibility } from '@prisma/client'

import { getCaseStatusInfo } from '../constants/caseStatus'

import { userCan } from './permissions'

type CaseAccessUser = { id: number; admin: boolean; capabilities: string[] } | null | undefined

type CaseForAccess = {
  reportedById: number | null
  participants: { id: number }[]
  service: { affiliatedUsers: { userId: number }[] }
}

/// Derived from the enum, not the display table, so a status nobody described
/// yet resolves through the same fail-closed fallback as isCasePublished rather
/// than dropping out of the filter and reading as published.
export const UNPUBLISHED_CASE_STATUSES: CaseStatus[] = Object.values(CaseStatus).filter(
  (status) => !getCaseStatusInfo(status).public
)

export function isCaseStaff(user: CaseAccessUser): boolean {
  return userCan(user, 'cases:manage')
}

export function isCasePublished(status: CaseStatus): boolean {
  return getCaseStatusInfo(status).public
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

type CaseEvidenceForAccess = {
  visibility: CaseVisibility
  case: CaseForAccess & { status: CaseStatus }
}

// canViewCaseEvidence mirrors the case page's gate for a single evidence item:
// staff see everything; everyone else needs the case published and the
// evidence's tier within their reach. It is the authority for serving the
// underlying evidence file, which lives outside the public upload routes.
export function canViewCaseEvidence(user: CaseAccessUser, evidence: CaseEvidenceForAccess): boolean {
  if (isCaseStaff(user)) return true
  if (!isCasePublished(evidence.case.status)) return false
  return caseVisibilityTiersFor(user, evidence.case).includes(evidence.visibility)
}
