import { max } from 'date-fns'

import type { Prisma, ServiceSuggestionStatus } from '@prisma/client'

// STALE_CLAIM_DAYS is how long a claimed suggestion may go without a message or status change before it
// shows among the unassigned ones again, so a forgotten claim doesn't hide it for good.
export const STALE_CLAIM_DAYS = 7

export const openSuggestionStatuses: ServiceSuggestionStatus[] = ['PENDING', 'UNDER_REVIEW']

// staffMessageWhere picks the messages that count as work on a claim. An author asking for news doesn't
// mean anyone is working on it.
export const staffMessageWhere = {
  user: { OR: [{ admin: true }, { capabilities: { has: 'suggestions:manage' } }] },
} satisfies Prisma.ServiceSuggestionMessageWhereInput

export function isStaleClaim(
  suggestion: { status: ServiceSuggestionStatus; assignedAt: Date | null; lastStaffMessageAt: Date | null },
  now = new Date()
) {
  if (!suggestion.assignedAt || !openSuggestionStatuses.includes(suggestion.status)) return false
  const lastActivityAt = max([suggestion.assignedAt, suggestion.lastStaffMessageAt ?? suggestion.assignedAt])
  return now.getTime() - lastActivityAt.getTime() > STALE_CLAIM_DAYS * 24 * 60 * 60 * 1000
}
