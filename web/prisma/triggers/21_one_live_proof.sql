-- A post has at most one live proof. Prisma's schema cannot express a partial unique index, so it lives here.
CREATE UNIQUE INDEX IF NOT EXISTS "CommentEvidence_one_live_per_comment"
ON "CommentEvidence" ("commentId") WHERE "removedAt" IS NULL AND "commentId" IS NOT NULL;
