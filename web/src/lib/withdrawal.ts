import type { CommentStatus } from '@prisma/client'

export const withdrawableStatuses: CommentStatus[] = ['PENDING', 'APPROVED']

// restoredStatus is where a withdrawn post goes back to: published only if it was published and has not
// changed since, otherwise through moderation again. Null means it cannot be restored (a deleted account's
// placeholder, or a post that was never withdrawn).
export function restoredStatus(post: {
  status: CommentStatus
  statusBeforeWithdrawal: CommentStatus | null
  version: number
  withdrawnVersion: number | null
}): CommentStatus | null {
  if (post.status !== 'WITHDRAWN' || !post.statusBeforeWithdrawal) return null
  return post.statusBeforeWithdrawal === 'APPROVED' && post.version === post.withdrawnVersion
    ? 'APPROVED'
    : 'PENDING'
}
