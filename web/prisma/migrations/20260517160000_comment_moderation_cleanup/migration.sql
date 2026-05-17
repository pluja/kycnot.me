-- ============================================================
-- Comment moderation schema cleanup.
-- - Rename note columns to describe audience (publicNote/adminNote/authorNote)
-- - Rename orderId -> privateProof, OrderIdStatus -> PrivateProofStatus
-- - Drop deprecated flags now superseded by ratingMuted + issues + humanAction
-- - Drop HUMAN_PENDING from CommentStatus
--
-- IMPORTANT: trigger re-import (just import-triggers) must run AFTER this migration.
-- We drop trigger functions here so column/type changes can proceed; the re-import
-- recreates everything against the new schema.
-- ============================================================

-- 0) Drop all Comment-touching triggers and dependent functions.
DROP TRIGGER IF EXISTS comment_rating_trust_before_write_trigger ON "Comment";
DROP TRIGGER IF EXISTS comment_average_rating_trigger ON "Comment";
DROP TRIGGER IF EXISTS comment_status_change_trigger ON "Comment";
DROP TRIGGER IF EXISTS comment_suspicious_change_trigger ON "Comment";
DROP TRIGGER IF EXISTS comment_rating_mute_change_trigger ON "Comment";
DROP TRIGGER IF EXISTS trg_notify_root_comment_inserted ON "Comment";
DROP TRIGGER IF EXISTS trg_notify_reply_comment_inserted ON "Comment";
DROP TRIGGER IF EXISTS trg_notify_reply_approved ON "Comment";
DROP TRIGGER IF EXISTS trg_notify_root_approved ON "Comment";
DROP TRIGGER IF EXISTS trg_notify_comment_status_changed ON "Comment";
DROP TRIGGER IF EXISTS trg_notify_community_note_added ON "Comment";
DROP TRIGGER IF EXISTS trigger_manage_comment_approved_at ON "Comment";

-- CASCADE drops any triggers (on Comment, User, ServiceUser, etc.) that depend on these functions.
-- Trigger re-import recreates everything.
DROP FUNCTION IF EXISTS handle_comment_approval(RECORD, RECORD) CASCADE;
DROP FUNCTION IF EXISTS handle_comment_verification(RECORD, RECORD) CASCADE;
DROP FUNCTION IF EXISTS handle_comment_spam_status(RECORD, RECORD) CASCADE;
DROP FUNCTION IF EXISTS handle_rating_mute_change(RECORD, RECORD) CASCADE;
DROP FUNCTION IF EXISTS handle_comment_status_change() CASCADE;
DROP FUNCTION IF EXISTS set_comment_rating_trust_before_write() CASCADE;
DROP FUNCTION IF EXISTS recalculate_service_user_rating(INT) CASCADE;
DROP FUNCTION IF EXISTS calculate_average_rating() CASCADE;
DROP FUNCTION IF EXISTS refresh_user_comment_rating_trust() CASCADE;
DROP FUNCTION IF EXISTS refresh_service_user_comment_rating_trust() CASCADE;
DROP FUNCTION IF EXISTS notify_root_comment_inserted() CASCADE;
DROP FUNCTION IF EXISTS notify_reply_comment_inserted() CASCADE;
DROP FUNCTION IF EXISTS notify_reply_approved() CASCADE;
DROP FUNCTION IF EXISTS notify_root_approved() CASCADE;
DROP FUNCTION IF EXISTS notify_comment_status_changed() CASCADE;
DROP FUNCTION IF EXISTS notify_community_note_added() CASCADE;
DROP FUNCTION IF EXISTS manage_comment_approved_at() CASCADE;
DROP FUNCTION IF EXISTS get_comment_moderation_context(INT) CASCADE;

-- Drop every signature of calculate_comment_rating_trust regardless of arg list.
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT oid::regprocedure::text AS sig FROM pg_proc WHERE proname = 'calculate_comment_rating_trust'
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig || ' CASCADE';
    END LOOP;
END
$$;

-- 1) Column renames (preserves data)
ALTER TABLE "Comment" RENAME COLUMN "internalNote" TO "adminNote";
ALTER TABLE "Comment" RENAME COLUMN "communityNote" TO "publicNote";
ALTER TABLE "Comment" RENAME COLUMN "privateContext" TO "authorNote";
ALTER TABLE "Comment" RENAME COLUMN "orderId" TO "privateProof";

-- 2) Rename OrderIdStatus enum, then rename column referencing it.
ALTER TYPE "OrderIdStatus" RENAME TO "PrivateProofStatus";
ALTER TABLE "Comment" RENAME COLUMN "orderIdStatus" TO "privateProofStatus";

-- 3) Rename the unique index that backed the (serviceId, orderId) constraint.
ALTER INDEX "Comment_serviceId_orderId_key" RENAME TO "Comment_serviceId_privateProof_key";

-- 4) Drop deprecated columns.
-- Forward any leftover requiresAdminReview=true rows to humanAction='HOLD' before drop.
-- The previous migration backfilled HUMAN_PENDING rows, but any other rows that
-- carried requiresAdminReview=true would lose that signal otherwise.
UPDATE "Comment"
   SET "humanAction" = 'HOLD',
       "humanDecidedAt" = COALESCE("humanDecidedAt", NOW())
 WHERE "requiresAdminReview" = true
   AND "humanAction" IS NULL;

DROP INDEX IF EXISTS "Comment_ratingDisabledByModerator_idx";
ALTER TABLE "Comment" DROP COLUMN IF EXISTS "suspicious";
ALTER TABLE "Comment" DROP COLUMN IF EXISTS "requiresAdminReview";
ALTER TABLE "Comment" DROP COLUMN IF EXISTS "verificationNote";
ALTER TABLE "Comment" DROP COLUMN IF EXISTS "kycRequested";
ALTER TABLE "Comment" DROP COLUMN IF EXISTS "fundsBlocked";
ALTER TABLE "Comment" DROP COLUMN IF EXISTS "ratingDisabledByModerator";

-- 5) Remove HUMAN_PENDING from CommentStatus by swapping the type.
-- HUMAN_PENDING rows were migrated to PENDING in the previous migration.
ALTER TYPE "CommentStatus" RENAME TO "CommentStatus_old";

CREATE TYPE "CommentStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'VERIFIED',
  'REJECTED'
);

ALTER TABLE "Comment"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "CommentStatus" USING ("status"::text::"CommentStatus"),
  ALTER COLUMN "status" SET DEFAULT 'PENDING';

DROP TYPE "CommentStatus_old";
