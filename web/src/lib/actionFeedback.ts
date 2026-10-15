import type { ActionError } from 'astro:actions'

// lastActionFeedback finds which of a panel's actions just ran and pairs its message with any error.
export function lastActionFeedback<Key extends string>(
  results: Record<Key, { error?: ActionError } | undefined>,
  messages: Record<Key, string>
) {
  const action = (Object.keys(results) as Key[]).find((key) => results[key])
  return {
    action,
    feedback: action ? { message: messages[action], error: results[action]?.error } : null,
  }
}
