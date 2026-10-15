import { z } from 'astro/zod'
import { ActionError } from 'astro:actions'

import { canReviewSuggestion, type UserForPermissions } from './permissions'
import { openSuggestionStatuses } from './suggestionAssignment'
import { emptyToUndefined } from './zodUtils'

import type { ServiceSuggestionStatus } from '@prisma/client'

type SuggestionWriter = {
  serviceSuggestion: {
    updateMany: (args: {
      where: { id: number; status: { in: ServiceSuggestionStatus[] }; assignedToId?: number | null }
      data: { status?: ServiceSuggestionStatus; assignedToId: number | null; assignedAt: Date | null }
    }) => Promise<{ count: number }>
  }
}

// seenAssigneeIdSchema reads who held the suggestion when the page was rendered, so nobody acts over a claim
// they didn't see.
export const seenAssigneeIdSchema = z.preprocess(
  emptyToUndefined,
  z.coerce.number().int().positive().optional()
)

const conflict = () =>
  new ActionError({
    code: 'CONFLICT',
    message: 'Someone else changed this suggestion first. Reload and try again.',
  })

// transitionSuggestion moves a suggestion to a new status only if it is still in one of the expected ones,
// and still held by seenAssigneeId when given, inside the caller's transaction. A second reviewer acting at
// the same time then fails here instead of writing over the first. Whoever moves it out of pending becomes
// its assignee; back to pending, nobody is.
export async function transitionSuggestion(
  tx: SuggestionWriter,
  suggestionId: number,
  status: ServiceSuggestionStatus,
  actorId: number,
  {
    from = openSuggestionStatuses,
    seenAssigneeId,
  }: { from?: ServiceSuggestionStatus[]; seenAssigneeId?: number | null } = {}
) {
  const unassigned = status === 'PENDING'
  const updated = await tx.serviceSuggestion.updateMany({
    where: {
      id: suggestionId,
      status: { in: from },
      ...(seenAssigneeId !== undefined && { assignedToId: seenAssigneeId }),
    },
    data: {
      status,
      assignedToId: unassigned ? null : actorId,
      assignedAt: unassigned ? null : new Date(),
    },
  })
  if (updated.count === 0) throw conflict()
}

// releaseSuggestion clears the assignee but keeps the status, so the author isn't told "back to pending"
// each time a moderator hands a suggestion back.
export async function releaseSuggestion(tx: SuggestionWriter, suggestionId: number, seenAssigneeId: number) {
  const updated = await tx.serviceSuggestion.updateMany({
    where: { id: suggestionId, status: { in: openSuggestionStatuses }, assignedToId: seenAssigneeId },
    data: { assignedToId: null, assignedAt: null },
  })
  if (updated.count === 0) throw conflict()
}

export const suggestionStatusLabel = (status: ServiceSuggestionStatus) =>
  status.replace('_', ' ').toLowerCase()

export function assertOpenSuggestion(suggestion: { status: ServiceSuggestionStatus }) {
  if (!openSuggestionStatuses.includes(suggestion.status)) {
    throw new ActionError({
      code: 'BAD_REQUEST',
      message: `Suggestion is already ${suggestionStatusLabel(suggestion.status)}.`,
    })
  }
}

type Reviewer = UserForPermissions & { id: number }

export function assertCanReviewSuggestion(
  suggestion: { userId: number },
  user: Reviewer,
  options: { applyingFieldEdits: boolean }
) {
  if (!canReviewSuggestion(suggestion, user, options)) {
    throw new ActionError({
      code: 'FORBIDDEN',
      message: 'You cannot review your own suggestion. Another moderator has to.',
    })
  }
}

// selfReviewNote marks audit summaries written by the suggestion's own author,
// so self-review can be found by searching the log.
export const selfReviewNote = (suggestion: { userId: number }, user: { id: number }) =>
  suggestion.userId === user.id ? ' (by its author)' : ''
