import { ActionError } from 'astro:actions'

import { userCan } from './permissions'

import type { ServiceSuggestionStatus } from '@prisma/client'

type SuggestionWriter = {
  serviceSuggestion: {
    updateMany: (args: {
      where: { id: number; status: { in: ServiceSuggestionStatus[] } }
      data: { status: ServiceSuggestionStatus }
    }) => Promise<{ count: number }>
  }
}

const openStatuses: ServiceSuggestionStatus[] = ['PENDING', 'UNDER_REVIEW']

/**
 * Moves a suggestion to a new status only if it is still in one of the expected
 * ones, inside the caller's transaction. A second reviewer acting at the same
 * time then fails here instead of writing over the first.
 */
export async function transitionSuggestion(
  tx: SuggestionWriter,
  suggestionId: number,
  status: ServiceSuggestionStatus,
  from: ServiceSuggestionStatus[] = openStatuses
) {
  const updated = await tx.serviceSuggestion.updateMany({
    where: { id: suggestionId, status: { in: from } },
    data: { status },
  })
  if (updated.count === 0) {
    throw new ActionError({ code: 'CONFLICT', message: 'Someone else reviewed this suggestion first.' })
  }
}

type Reviewer = { id: number; admin: boolean; capabilities: string[] }

/**
 * Whether the user may approve this suggestion. Their own needs a second pair
 * of eyes unless they hold suggestions:self-apply; admins hold every capability.
 */
export function canReviewSuggestion(suggestion: { userId: number }, user: Reviewer) {
  return suggestion.userId !== user.id || userCan(user, 'suggestions:self-apply')
}

export function assertCanReviewSuggestion(suggestion: { userId: number }, user: Reviewer) {
  if (!canReviewSuggestion(suggestion, user)) {
    throw new ActionError({
      code: 'FORBIDDEN',
      message: 'You cannot review your own suggestion. Another moderator has to.',
    })
  }
}

/** Marks an audit summary when someone approved their own suggestion. */
export const selfReviewNote = (suggestion: { userId: number }, user: { id: number }) =>
  suggestion.userId === user.id ? ' (self-applied)' : ''
