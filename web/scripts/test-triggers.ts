import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

import pg from 'pg'

// PL/pgSQL only resolves column names when a function runs, so importing the trigger files proves
// little. This builds the schema from the migrations, imports every trigger file, then exercises
// the triggers inside a transaction that is rolled back.
const url = new URL(process.env.EXPERIENCE_TEST_DATABASE_URL ?? '')
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !url.pathname.endsWith('_legacy')) {
  throw new Error('Use a local database ending in _legacy; each run empties it')
}
const client = new pg.Client({ connectionString: url.toString() })
await client.connect()
const query = (sql: string) => client.query<Record<string, unknown>>(sql)
const one = async (sql: string) => (await query(sql)).rows[0] ?? {}

try {
  await query('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
  for (const migration of (await fs.readdir('prisma/migrations')).filter((name) => /^\d/.test(name)).sort()) {
    await query(await fs.readFile(`prisma/migrations/${migration}/migration.sql`, 'utf8'))
  }
  for (const file of (await fs.readdir('prisma/triggers')).filter((name) => name.endsWith('.sql')).sort()) {
    await query(await fs.readFile(`prisma/triggers/${file}`, 'utf8'))
  }

  await query('BEGIN')
  await query(`
    INSERT INTO "User" (id, name, "secretTokenHash", "feedId") VALUES
      (1, 'author', 'hash-author', 'feed-author'),
      (2, 'voter', 'hash-voter', 'feed-voter'),
      (3, 'watcher', 'hash-watcher', 'feed-watcher');
    INSERT INTO "User" (id, name, "secretTokenHash", "feedId", capabilities)
      VALUES (4, 'moderator', 'hash-moderator', 'feed-moderator', ARRAY['comments:moderate']);
    INSERT INTO "NotificationPreferences" ("userId") VALUES (1), (2), (3);
    INSERT INTO "Service" (id, name, slug, description, "serviceUrls")
      VALUES (1, 'Trigger test', 'trigger-test', 'Local test service', ARRAY['https://example.com']);
    INSERT INTO "_onRootCommentCreatedForServices" ("A", "B") SELECT id, 1 FROM "NotificationPreferences" WHERE "userId" = 3;
    INSERT INTO "Comment" (id, content, "authorId", "serviceId", status, kind)
      VALUES (1, 'A root experience used to exercise the triggers.', 1, 1, 'PENDING', 'EXPERIENCE');
    INSERT INTO "CommentExperience" ("commentId", sentiment, outcome) VALUES (1, 'POSITIVE', 'NO_ISSUE');
    INSERT INTO "Comment" (id, content, "authorId", "serviceId", "parentId", status, kind)
      VALUES (2, 'A reply used to exercise the triggers.', 3, 1, 1, 'PENDING', 'DISCUSSION');
  `)

  await query('UPDATE "Comment" SET status = \'APPROVED\' WHERE id IN (1, 2)')
  await query('UPDATE "Comment" SET "humanAction" = \'HOLD\' WHERE id = 2')
  await query('UPDATE "Comment" SET "publicNote" = \'A moderator note.\' WHERE id = 1')
  const published = await one(
    'SELECT "approvedAt" IS NOT NULL AS stamped, "moderationState" FROM "Comment" WHERE id = 1'
  )
  assert.equal(published.stamped, true)
  assert.equal(published.moderationState, 'RESOLVED')

  await query(`
    INSERT INTO "CommentEvidence" (id, "commentId", "authorId", body, "needsCheck") VALUES (1, 1, 1, 'order-123', true);
    INSERT INTO "EvidenceCheck" ("evidenceId", finding, explanation)
      VALUES (1, 'ORDER_FOUND', 'Matched in the merchant panel.');
  `)

  await query(`
    INSERT INTO "ServiceSuggestion" (id, type, "userId", "serviceId") VALUES (1, 'EDIT_SERVICE', 1, 1);
    UPDATE "ServiceSuggestion" SET status = 'APPROVED' WHERE id = 1;
  `)

  const trust = await one('SELECT * FROM user_trust(ARRAY[1])')
  assert.equal(trust.publishedPosts, 1)
  assert.equal(trust.checkedProofPosts, 1)
  assert.equal(trust.approvedSuggestions, 1)
  assert.ok((await one('SELECT get_comment_moderation_context(2) AS context')).context)
  assert.ok((await one("SELECT get_comment_moderation_context(1, 'An edited text.') AS context")).context)
  const submission = (await one("SELECT get_comment_moderation_context(1)->'comment'->'submission' AS s"))
    .s as Record<string, unknown>
  assert.deepEqual(
    [
      submission.proofIdReused,
      submission.proofIdOffFormat,
      submission.newAccountWave,
      submission.hasAcceptedProof,
    ],
    [false, false, false, true]
  )

  await query(`
    INSERT INTO "ContactThread" (id, category, "commentId", "authorId") VALUES (1, 'COMMENT_REPORT', 1, 3);
    INSERT INTO "ContactMessage" (id, "threadId", "authorId", content) VALUES (1, 1, 3, 'A report about the post.');
  `)
  assert.equal(
    (
      await one(
        'SELECT count(*)::int AS n FROM "Notification" WHERE "userId" = 4 AND "aboutContactThreadId" = 1'
      )
    ).n,
    1
  )

  await query('UPDATE "CommentEvidence" SET "removedAt" = NOW() WHERE id = 1')
  await query('UPDATE "Comment" SET status = \'REJECTED\', "humanDecisionReason" = \'SPAM\' WHERE id = 2')
  const before = await one('SELECT version, content FROM "Comment" WHERE id = 1')
  await query(`
    INSERT INTO "CommentRevision" (id, "commentId", "authorId", "baseVersion", content, kind, "experienceData")
    VALUES
      (10, 1, 1, ${String(before.version)}, 'An edited root experience after the service changed.', 'EXPERIENCE', '{"sentiment": "NEGATIVE", "outcome": "ONGOING", "issues": ["FUNDS_BLOCKED"]}'),
      (11, 1, 1, ${String(before.version)}, 'A second edit written against the same version.', 'EXPERIENCE', '{}');
  `)
  await query('UPDATE "Comment" SET "humanAction" = \'HOLD\' WHERE id = 1')
  assert.equal(
    (await one("SELECT apply_comment_revision(10, true, 2, 'Looks fine', NULL) AS decided")).decided,
    true
  )
  assert.equal((await one('SELECT "humanAction" FROM "Comment" WHERE id = 1')).humanAction, 'HOLD')
  assert.equal(
    (
      await one(
        'SELECT count(*)::int AS unmarked FROM "Notification" WHERE "aboutCommentId" = 1 AND "aboutCommentStatusChange" = \'UNMARKED_FOR_ADMIN_REVIEW\''
      )
    ).unmarked,
    0
  )
  const edited = await one(`
    SELECT c.version, c.content, e.sentiment, e.outcome,
      (SELECT count(*)::int FROM "CommentRevision" r WHERE r."commentId" = 1 AND r.status = 'APPROVED' AND r.content = '${String(before.content)}') AS snapshots
    FROM "Comment" c JOIN "CommentExperience" e ON e."commentId" = c.id WHERE c.id = 1`)
  assert.equal(edited.version, Number(before.version) + 1)
  assert.equal(edited.content, 'An edited root experience after the service changed.')
  assert.equal(edited.sentiment, 'NEGATIVE')
  assert.equal(edited.outcome, 'ONGOING')
  assert.deepEqual((await one('SELECT issues::text[] AS issues FROM "Comment" WHERE id = 1')).issues, [
    'FUNDS_BLOCKED',
  ])
  assert.equal(edited.snapshots, 1)

  assert.equal(
    (await one('SELECT apply_comment_revision(11, true, NULL, NULL, NULL) AS decided')).decided,
    false
  )
  assert.equal((await one('SELECT status FROM "CommentRevision" WHERE id = 11')).status, 'PENDING')

  assert.equal(
    (await one("SELECT apply_comment_revision(11, false, NULL, NULL, 'SPAM') AS decided")).decided,
    true
  )
  const rejected = await one('SELECT status, "decisionRule" FROM "CommentRevision" WHERE id = 11')
  assert.equal(rejected.status, 'REJECTED')
  assert.equal(rejected.decisionRule, 'SPAM')
  assert.equal(
    (await one('SELECT content FROM "Comment" WHERE id = 1')).content,
    'An edited root experience after the service changed.'
  )

  const count = async (sql: string) => Number((await one(`SELECT count(*)::int AS n FROM ${sql}`)).n)
  const rootNotices = () =>
    count('"Notification" WHERE type = \'ROOT_COMMENT_CREATED\' AND "aboutCommentId" = 1')
  const statusNotices = () =>
    count('"Notification" WHERE type = \'COMMENT_STATUS_CHANGE\' AND "aboutCommentId" = 1')
  const [noticesBefore, statusBefore] = [await rootNotices(), await statusNotices()]
  assert.equal(noticesBefore, 1)
  await query(
    'UPDATE "Comment" SET status = \'WITHDRAWN\', "statusBeforeWithdrawal" = \'APPROVED\' WHERE id = 1'
  )
  await query('UPDATE "Comment" SET status = \'APPROVED\', "statusBeforeWithdrawal" = NULL WHERE id = 1')
  assert.equal(await rootNotices(), noticesBefore)
  assert.equal(await statusNotices(), statusBefore)
  assert.equal((await one('SELECT "approvedAt" IS NOT NULL AS kept FROM "Comment" WHERE id = 1')).kept, true)

  await query(`
    INSERT INTO "Comment" (id, content, "authorId", "serviceId", status, kind)
      VALUES (40, 'An unanswered post by the author of the deleted account.', 1, 1, 'APPROVED', 'DISCUSSION');
    INSERT INTO "Comment" (id, content, "authorId", "serviceId", "parentId", status, kind)
      VALUES (41, 'A reply by the author of the deleted account.', 1, 1, 1, 'APPROVED', 'DISCUSSION');
    INSERT INTO "Comment" (id, content, "authorId", "serviceId", "parentId", "replyToId", status, kind)
      VALUES (42, 'An answer to that reply from someone else.', 3, 1, 1, 41, 'APPROVED', 'DISCUSSION');
  `)
  await query(`
    INSERT INTO "Comment" (id, content, "authorId", "serviceId", status, kind)
      VALUES (43, 'A rejected post by the author of the deleted account.', 1, 1, 'REJECTED', 'DISCUSSION');
    INSERT INTO "Comment" (id, content, "authorId", "serviceId", "parentId", status, kind)
      VALUES (44, 'A published reply from someone else under the rejected post.', 3, 1, 43, 'APPROVED', 'DISCUSSION');
    INSERT INTO "Comment" (id, content, "authorId", "serviceId", status, kind)
      VALUES (45, 'A post by the author of the deleted account that was never published.', 1, 1, 'PENDING', 'DISCUSSION');
    INSERT INTO "CommentRevision" ("commentId", "authorId", "baseVersion", content, kind, status)
      VALUES (1, 1, 1, 'An edit nobody reviewed yet.', 'EXPERIENCE', 'PENDING');
    INSERT INTO "CommentRevision" ("commentId", "authorId", "baseVersion", content, kind, status)
      VALUES (1, 1, 1, 'An edit a moderator rejected.', 'EXPERIENCE', 'REJECTED');
    UPDATE "Comment" SET "authorNote" = 'A private note to the moderators.' WHERE id = 1;
  `)
  await query('SELECT delete_user_account(1)')
  const kept = await one(
    'SELECT status, "authorId", content <> \'\' AS "hasText" FROM "Comment" WHERE id = 1'
  )
  assert.deepEqual(kept, { status: 'APPROVED', authorId: null, hasText: true })
  assert.equal(await count('"Comment" WHERE id IN (40, 41) AND "authorId" IS NULL'), 2)
  assert.equal(
    (await one('SELECT "replyTargetDeleted" FROM "Comment" WHERE id = 42')).replyTargetDeleted,
    false
  )
  assert.deepEqual(await one('SELECT status, "authorId", content FROM "Comment" WHERE id = 43'), {
    status: 'WITHDRAWN',
    authorId: null,
    content: '',
  })
  assert.equal(await count('"Comment" WHERE id = 45'), 0)
  assert.equal(await count('"CommentRevision" WHERE "commentId" = 1 AND status <> \'APPROVED\''), 0)
  assert.equal((await one('SELECT "authorNote" FROM "Comment" WHERE id = 1')).authorNote, null)
  assert.equal(await count('"CommentExperience" WHERE "commentId" = 1'), 1)
  assert.equal((await one('SELECT "commentId" FROM "CommentEvidence" WHERE id = 1')).commentId, 1)
  assert.equal(await count('"EvidenceCheck" WHERE "evidenceId" = 1'), 1)
  assert.equal(await count('"User" WHERE id = 1'), 0)

  await query('UPDATE "Comment" SET "publicNote" = \'A note on a placeholder.\' WHERE id = 1')
  await query('UPDATE "Comment" SET "humanAction" = \'HOLD\', status = \'WITHDRAWN\' WHERE id = 42')
  assert.equal(
    (await one('SELECT "moderationState" FROM "Comment" WHERE id = 42')).moderationState,
    'RESOLVED'
  )

  await query('ROLLBACK')
  console.info('Trigger smoke test passed')
} finally {
  await client.end()
}
