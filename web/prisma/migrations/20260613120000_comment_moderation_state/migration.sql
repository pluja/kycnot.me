CREATE TYPE "CommentModerationState" AS ENUM ('AWAITING_AI', 'AWAITING_HUMAN', 'RESOLVED');

ALTER TABLE "Comment"
  ADD COLUMN "moderationState" "CommentModerationState" NOT NULL DEFAULT 'AWAITING_AI';

-- One-time backfill for existing rows. Ongoing maintenance is owned by
-- compute_comment_moderation_state() in prisma/triggers/16_comment_moderation_state.sql;
-- this CASE mirrors that function for the historical rows only.
UPDATE "Comment" SET "moderationState" = (CASE
  WHEN "humanAction" IN ('APPROVE', 'REJECT') THEN 'RESOLVED'
  WHEN "humanAction" = 'HOLD' THEN 'AWAITING_HUMAN'
  WHEN "status" = 'PENDING' AND "aiAction" = 'HOLD' THEN 'AWAITING_HUMAN'
  WHEN "status" = 'PENDING' AND "aiDecidedAt" IS NULL THEN 'AWAITING_AI'
  WHEN "status" = 'PENDING' THEN 'AWAITING_HUMAN'
  ELSE 'RESOLVED'
END)::"CommentModerationState";

CREATE INDEX "Comment_moderationState_idx" ON "Comment"("moderationState");
