import { ActionError } from 'astro:actions'

import { canReviewSuggestion } from './permissions'

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
