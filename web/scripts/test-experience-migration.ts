import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'

import pg from 'pg'

const url = new URL(process.env.EXPERIENCE_TEST_DATABASE_URL ?? '')
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !url.pathname.endsWith('_legacy')) {
  throw new Error('Use a local database ending in _legacy; each run empties it')
}
const client = new pg.Client({ connectionString: url.toString() })
await client.connect()
const query = (sql: string, values?: unknown[]) => client.query<Record<string, unknown>>(sql, values)
const rows = async (sql: string, values?: unknown[]) => (await query(sql, values)).rows
try {
  // The guard above limits this to a local *_legacy database, so each run starts from an empty schema.
  await query('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
  const latest = '20261004130000_experiences_and_discussions'
  for (const migration of (await fs.readdir('prisma/migrations'))
    .filter((name) => /^\d/.test(name) && name < latest)
    .sort()) {
    await query(await fs.readFile(`prisma/migrations/${migration}/migration.sql`, 'utf8'))
  }
  const legacyCommit = '027e6f1f9f03e50e983407a91ee3853e61cf2b7c'
  const legacyTriggers = execFileSync(
    'git',
    ['ls-tree', '--name-only', `${legacyCommit}:web/prisma/triggers`],
    { encoding: 'utf8' }
  )
    .split('\n')
    .filter((name) => name.endsWith('.sql') && name < '17')
    .sort()
  for (const file of legacyTriggers) {
    await query(
      execFileSync('git', ['show', `${legacyCommit}:web/prisma/triggers/${file}`], { encoding: 'utf8' })
    )
  }
  await query(`INSERT INTO "User" (id,name,"secretTokenHash","feedId") VALUES (1,'author','test-author','test-author'),(2,'moderator','test-mod','test-mod'),(3,'watcher','test-watch','test-watch');
    INSERT INTO "Service" (id,name,slug,description,"serviceUrls") VALUES (1,'Experience test','experience-test','Local test service',ARRAY['https://example.com']);
    INSERT INTO "Comment" (id,content,"authorId","serviceId",status,rating,"privateProof","privateProofStatus","createdAt") VALUES
      (1,'A historical negative experience with this service.',1,1,'APPROVED',1,'private-order-123','APPROVED','2024-01-01'),
      (2,'A historical neutral experience with this service.',1,1,'APPROVED',3,NULL,NULL,'2024-02-01'),
      (3,'A historical positive experience with this service.',1,1,'APPROVED',5,NULL,NULL,'2024-03-01'),
      (4,'A pending historical complaint awaiting review.',1,1,'PENDING',NULL,'private-pending','PENDING','2024-04-01'),
      (5,'A verified experience whose new reference waits for a check.',2,1,'VERIFIED',2,'private-verified-pending','PENDING','2024-05-01'),
      (6,'A verified experience whose reference was rejected.',2,1,'VERIFIED',2,'private-verified-rejected','REJECTED','2024-06-01');
    INSERT INTO "NotificationPreferences" ("userId","enableNotifyPendingRepliesOnWatch","enableOnMyCommentStatusChange") VALUES (1,true,true),(3,true,true);
    INSERT INTO "_onRootCommentCreatedForServices" ("A","B") SELECT id,1 FROM "NotificationPreferences" WHERE "userId"=3;
    SELECT setval(pg_get_serial_sequence('"Comment"','id'),6);`)
  const before = await rows('SELECT id,status,content,"createdAt",rating FROM "Comment" ORDER BY id')
  const karma = await rows('SELECT id,"totalKarma" FROM "User" ORDER BY id')
  const notifications = await rows('SELECT count(*) FROM "Notification"')
  for (const migration of (await fs.readdir('prisma/migrations'))
    .filter((name) => /^\d/.test(name) && name >= latest)
    .sort()) {
    await query(await fs.readFile(`prisma/migrations/${migration}/migration.sql`, 'utf8'))
  }
  // A deploy re-imports the current triggers right after migrating.
  for (const file of (await fs.readdir('prisma/triggers')).filter((name) => name.endsWith('.sql')).sort()) {
    await query(await fs.readFile(`prisma/triggers/${file}`, 'utf8'))
  }
  // Verified folds into Approved; nothing else about a post changes.
  assert.deepEqual(
    await rows('SELECT id,status,content,"createdAt",rating FROM "Comment" ORDER BY id'),
    before.map((row) => ({ ...row, status: row.status === 'VERIFIED' ? 'APPROVED' : row.status }))
  )
  assert.deepEqual(await rows('SELECT id,"totalKarma" FROM "User" ORDER BY id'), karma)
  // A Verified post kept its accepted older check plus the reference that came later; one proof stays.
  assert.deepEqual(
    await rows(
      'SELECT "commentId", body, "legacyStatus", "needsCheck" FROM "CommentEvidence" WHERE "commentId" IN (5,6) AND "removedAt" IS NULL ORDER BY "commentId"'
    ),
    [
      { commentId: 5, body: 'private-verified-pending', legacyStatus: 'APPROVED', needsCheck: true },
      { commentId: 6, body: null, legacyStatus: 'APPROVED', needsCheck: false },
    ]
  )
  assert.equal(
    (
      await rows(
        'SELECT count(*) FROM "CommentEvidence" WHERE "commentId" IN (5,6) AND body IS NOT NULL AND "removedAt" IS NOT NULL'
      )
    )[0]?.count,
    '0'
  )
  assert.equal(
    (
      await rows(
        'SELECT 1 FROM "Comment" WHERE status = \'APPROVED\' AND "approvedAt" IS DISTINCT FROM "createdAt"'
      )
    ).length,
    0
  )
  assert.deepEqual(await rows('SELECT count(*) FROM "Notification"'), notifications)
  assert.deepEqual(
    (await rows('SELECT sentiment FROM "CommentExperience" ORDER BY "commentId"')).map(
      (row) => row.sentiment
    ),
    ['NEGATIVE', 'NEUTRAL', 'POSITIVE', 'NEGATIVE', 'NEGATIVE']
  )
  assert.equal((await rows('SELECT count(*) FROM "CommentRevision" WHERE status=\'PENDING\''))[0]?.count, '0')
  assert.equal(
    (
      await rows(
        "SELECT 1 FROM information_schema.columns WHERE table_name='Comment' AND column_name='privateProof'"
      )
    ).length,
    0
  )
  const evidence = (await rows('SELECT id FROM "CommentEvidence" WHERE "commentId"=1'))[0]
  assert.ok(evidence)
  assert.equal(
    (await rows('SELECT "checkedAt" FROM "EvidenceCheck" WHERE "evidenceId"=$1', [evidence.id]))[0]
      ?.checkedAt,
    null
  )
  assert.equal(
    JSON.stringify(await rows('SELECT get_comment_moderation_context(1)')).includes('private-order-123'),
    false
  )
  await query(
    'UPDATE "CommentEvidence" SET "imagePath"=\'/files/comment-evidence/00000000-0000-0000-0000-000000000001/abcdef.webp\' WHERE id=$1',
    [evidence.id]
  )
  await query('UPDATE "CommentEvidence" SET "removedAt"=NOW() WHERE id=$1', [evidence.id])
  assert.deepEqual(
    (await rows('SELECT body,"imagePath","needsCheck" FROM "CommentEvidence" WHERE id=$1', [evidence.id]))[0],
    { body: null, imagePath: null, needsCheck: false }
  )
  assert.equal(
    (await rows('SELECT count(*) FROM "EvidenceCheck" WHERE "evidenceId"=$1', [evidence.id]))[0]?.count,
    '1'
  )
  assert.equal((await rows('SELECT count(*) FROM "EvidenceFileCleanup"'))[0]?.count, '1')
  await query(
    'INSERT INTO "Comment" (content,"authorId","serviceId",kind) VALUES (\'A new pending post that must stay private.\',1,1,\'EXPERIENCE\')'
  )
  assert.equal((await rows('SELECT count(*) FROM "Notification" WHERE "userId"=3'))[0]?.count, '0')
  await query('UPDATE "Comment" SET status=\'REJECTED\' WHERE id=7')
  assert.equal(
    (await rows('SELECT count(*) FROM "Notification" WHERE "userId"=1 AND "aboutCommentId"=7'))[0]?.count,
    '1'
  )
  const otherAuthorChecks = Number(
    (
      await rows(
        'SELECT count(*) FROM "EvidenceCheck" k JOIN "CommentEvidence" e ON e.id=k."evidenceId" JOIN "Comment" c ON c.id=e."commentId" WHERE c."authorId"=2'
      )
    )[0]?.count
  )
  await query('SELECT delete_user_account(1)')
  assert.equal(
    (
      await rows(
        'SELECT count(*) FROM "CommentEvidence" e WHERE (body IS NOT NULL OR "imagePath" IS NOT NULL) AND "authorId" IS DISTINCT FROM 2'
      )
    )[0]?.count,
    '0'
  )
  assert.equal(Number((await rows('SELECT count(*) FROM "EvidenceCheck"'))[0]?.count), 1 + otherAuthorChecks)
  console.info('Historical migration, privacy, cleanup, notification and preservation checks passed')
} finally {
  await client.end()
}
