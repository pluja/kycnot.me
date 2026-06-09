import type { ContactStatus } from '@prisma/client'

// Max consecutive messages a user may send before a staff reply. Caps nagging
// ("hi", "hello?", "answer please") while leaving room for a legit follow-up
// or correction. Set to 1 for a strict one-message-then-wait turn-gate. The
// counter resets after each staff reply.
export const CONTACT_MAX_UNANSWERED_MESSAGES = 3

// canUserSendMessage reports whether the thread author may post another message.
// A resolved thread is always closed; otherwise it depends on how many of the
// author's messages remain unanswered by staff.
export function canUserSendMessage({
  status,
  unansweredUserMessages,
}: {
  status: ContactStatus
  unansweredUserMessages: number
}): boolean {
  if (status === 'RESOLVED') return false
  return unansweredUserMessages < CONTACT_MAX_UNANSWERED_MESSAGES
}
