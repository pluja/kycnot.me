import type { Prisma } from '@prisma/client'

// Every call from TypeScript into a SQL function lives here, so a test can run each exact call through
// Prisma. Prisma sends JavaScript numbers as bigint, which matches no INT parameter, so each
// argument is cast to the function's type.

type Db = Pick<Prisma.TransactionClient, '$executeRaw' | '$queryRaw'>

export async function applyCommentRevision(
  db: Db,
  edit: { revisionId: number; approve: boolean; decidedById: number | null; reason: string | null }
) {
  const [row] = await db.$queryRaw<{ decided: boolean }[]>`
    SELECT apply_comment_revision(
      ${edit.revisionId}::int, ${edit.approve}::boolean, ${edit.decidedById}::int, ${edit.reason}::text, NULL
    ) AS decided`
  return row?.decided ?? false
}

export async function deleteUserAccount(db: Db, userId: number) {
  await db.$executeRaw`SELECT delete_user_account(${userId}::int)`
}

export type UserTrustRow = {
  userId: number
  publishedPosts: number
  checkedProofPosts: number
  approvedSuggestions: number
  penalizingRejections: number
  spamRejections: number
  // Posts wait for a moderator.
  untrusted: boolean
  commentsDisabled: boolean
}

export function userTrustRows(db: Db, userIds: number[]) {
  return db.$queryRaw<UserTrustRow[]>`SELECT * FROM user_trust(${userIds}::int[])`
}
