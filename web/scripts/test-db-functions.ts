import assert from 'node:assert/strict'

import { PrismaClient } from '@prisma/client'

import { applyCommentRevision, deleteUserAccount, userTrustRows } from '../src/lib/dbFunctions'

// The trigger smoke test calls the SQL functions with literal SQL, which hides parameter-type errors: Prisma
// sends JavaScript numbers as bigint. This runs the app's own calls through Prisma with plain numbers, on the
// schema test-triggers.ts leaves behind, inside a transaction that is rolled back.
const url = new URL(process.env.EXPERIENCE_TEST_DATABASE_URL ?? '')
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !url.pathname.endsWith('_legacy')) {
  throw new Error('Use a local database ending in _legacy; run scripts/test-triggers.ts first')
}
const prisma = new PrismaClient({ datasourceUrl: url.toString() })
const rollback = new Error('rollback')

try {
  await prisma.$transaction(async (tx) => {
    for (const statement of [
      `INSERT INTO "User" (id, name, "secretTokenHash", "feedId") VALUES
        (101, 'db-author', 'hash-101', 'feed-101'), (102, 'db-moderator', 'hash-102', 'feed-102')`,
      `INSERT INTO "Service" (id, name, slug, description, "serviceUrls")
        VALUES (101, 'Typed calls', 'typed-calls', 'Local test service', ARRAY['https://example.com'])`,
      `INSERT INTO "Comment" (id, content, "authorId", "serviceId", status, kind)
        VALUES (101, 'A published post whose edit is decided through Prisma.', 101, 101, 'APPROVED', 'DISCUSSION')`,
    ]) {
      await tx.$executeRawUnsafe(statement)
    }
    const { version } = await tx.comment.findUniqueOrThrow({ where: { id: 101 }, select: { version: true } })
    await tx.$executeRawUnsafe(`
      INSERT INTO "CommentRevision" (id, "commentId", "authorId", "baseVersion", content, kind)
      VALUES (101, 101, 101, ${String(version)}, 'The edited text, applied through Prisma.', 'DISCUSSION'),
             (102, 101, 101, ${String(version + 1)}, 'A second edit the author withdraws.', 'DISCUSSION');
    `)

    assert.equal(
      await applyCommentRevision(tx, {
        revisionId: 101,
        approve: true,
        decidedById: 102,
        reason: 'Looks fine',
      }),
      true
    )
    assert.equal(
      await applyCommentRevision(tx, {
        revisionId: 102,
        approve: false,
        decidedById: 101,
        reason: 'Withdrawn by the author.',
      }),
      true
    )
    assert.equal(
      await applyCommentRevision(tx, { revisionId: 102, approve: true, decidedById: null, reason: null }),
      false
    )
    assert.equal((await userTrustRows(tx, [101, 102])).length, 2)
    await deleteUserAccount(tx, 101)
    assert.equal(await tx.user.count({ where: { id: 101 } }), 0)
    throw rollback
  })
} catch (error) {
  if (error !== rollback) throw error
} finally {
  await prisma.$disconnect()
}
console.info('Database function calls through Prisma passed')
