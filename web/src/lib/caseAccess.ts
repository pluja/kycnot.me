import { CaseStatus } from '@prisma/client'

import { userCan } from './permissions'

type CaseAccessUser = { id: number; admin: boolean; capabilities: string[] } | null | undefined

const PARTICIPANT_HIDDEN_STATUSES: CaseStatus[] = [CaseStatus.DRAFT, CaseStatus.REJECTED]

export function isCaseStaff(user: CaseAccessUser): boolean {
  return userCan(user, 'cases:manage')
}

export function isCaseVisibleToParticipants(status: CaseStatus): boolean {
  return !PARTICIPANT_HIDDEN_STATUSES.includes(status)
}

// Staff can always participate. Otherwise a user must be explicitly attached to
// the case or affiliated with the reported service.
export function canParticipateInCase(
  user: CaseAccessUser,
  participantUserIds: number[],
  affiliatedUserIds: number[]
): boolean {
  if (isCaseStaff(user)) return true
  if (!user) return false
  return participantUserIds.includes(user.id) || affiliatedUserIds.includes(user.id)
}
