-- CreateEnum
CREATE TYPE "ModerationAction" AS ENUM ('APPROVE', 'REJECT', 'HOLD');

-- CreateEnum
CREATE TYPE "ModerationActor" AS ENUM ('AI', 'HUMAN');

-- CreateEnum
CREATE TYPE "RatingMuteReason" AS ENUM ('AUTHOR_AFFILIATED', 'AUTHOR_LOW_TRUST', 'SUSPICIOUS_PATTERN', 'TEMPLATE_SPAM', 'CONFLICT_OF_INTEREST', 'MODERATOR_DISCRETION');

-- CreateEnum
CREATE TYPE "CommentIssueType" AS ENUM ('KYC_REQUESTED', 'FUNDS_BLOCKED');

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "aiAction" "ModerationAction",
ADD COLUMN     "aiBrigadeConfidence" INTEGER,
ADD COLUMN     "aiDecidedAt" TIMESTAMP(3),
ADD COLUMN     "aiIsBrigade" BOOLEAN,
ADD COLUMN     "aiIsSpam" BOOLEAN,
ADD COLUMN     "aiQuality" INTEGER,
ADD COLUMN     "aiReasoning" TEXT,
ADD COLUMN     "aiSignals" JSONB,
ADD COLUMN     "humanAction" "ModerationAction",
ADD COLUMN     "humanDecidedAt" TIMESTAMP(3),
ADD COLUMN     "humanDecidedById" INTEGER,
ADD COLUMN     "humanReasoning" TEXT,
ADD COLUMN     "issues" "CommentIssueType"[] DEFAULT ARRAY[]::"CommentIssueType"[],
ADD COLUMN     "ratingMuteReason" "RatingMuteReason",
ADD COLUMN     "ratingMuted" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Comment_ratingMuted_idx" ON "Comment"("ratingMuted");

-- CreateIndex
CREATE INDEX "Comment_aiAction_idx" ON "Comment"("aiAction");

-- CreateIndex
CREATE INDEX "Comment_aiIsBrigade_idx" ON "Comment"("aiIsBrigade");

-- CreateIndex
CREATE INDEX "Comment_humanAction_idx" ON "Comment"("humanAction");

-- CreateIndex
CREATE INDEX "Comment_humanDecidedById_idx" ON "Comment"("humanDecidedById");

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_humanDecidedById_fkey" FOREIGN KEY ("humanDecidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- Backfill: map deprecated flags to the new fields.
-- Safe to run multiple times: only updates rows that have not been
-- backfilled yet (NULL ratingMuteReason guard).
-- ============================================================

-- suspicious=true wins over ratingDisabledByModerator when both set;
-- it carries the stronger semantic (coordinated pattern).
UPDATE "Comment"
SET "ratingMuted" = true,
    "ratingMuteReason" = 'SUSPICIOUS_PATTERN'
WHERE suspicious = true
  AND "ratingMuteReason" IS NULL;

UPDATE "Comment"
SET "ratingMuted" = true,
    "ratingMuteReason" = 'MODERATOR_DISCRETION'
WHERE "ratingDisabledByModerator" = true
  AND "ratingMuteReason" IS NULL;

-- Boolean issue flags into the issues array. The array column has a
-- default of empty so all rows already have a writable target.
UPDATE "Comment"
SET issues = array_append(issues, 'KYC_REQUESTED'::"CommentIssueType")
WHERE "kycRequested" = true
  AND NOT ('KYC_REQUESTED'::"CommentIssueType" = ANY(issues));

UPDATE "Comment"
SET issues = array_append(issues, 'FUNDS_BLOCKED'::"CommentIssueType")
WHERE "fundsBlocked" = true
  AND NOT ('FUNDS_BLOCKED'::"CommentIssueType" = ANY(issues));

-- Migrate the single HUMAN_PENDING row (if any) to PENDING + requiresAdminReview=true.
-- The HUMAN_PENDING enum value stays in CommentStatus until PR 2; the app should
-- not produce new HUMAN_PENDING rows.
UPDATE "Comment"
SET status = 'PENDING',
    "requiresAdminReview" = true
WHERE status = 'HUMAN_PENDING';
