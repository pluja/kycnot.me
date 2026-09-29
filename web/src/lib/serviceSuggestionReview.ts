import { ActionError } from 'astro:actions'

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

/**
 * Keeps scoped staff from approving their own edits, which would turn a
 * suggestion into a direct write with no second pair of eyes. Admins already
 * edit services directly, so the rule would only get in their way.
 */
export function assertNotOwnSuggestion(suggestion: { userId: number }, user: { id: number; admin: boolean }) {
  if (!user.admin && suggestion.userId === user.id) {
    throw new ActionError({
      code: 'FORBIDDEN',
      message: 'You cannot review your own suggestion. Another moderator has to.',
    })
  }
}
