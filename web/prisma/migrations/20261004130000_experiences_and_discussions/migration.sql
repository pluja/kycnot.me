-- ==== user experiences ====

BEGIN;
ALTER TYPE "NotificationType" ADD VALUE 'COMMENT_EDIT_REVIEWED';
ALTER TYPE "NotificationType" ADD VALUE 'COMMENT_EVIDENCE_CHECKED';
ALTER TYPE "NotificationType" ADD VALUE 'COMMENT_PROOF_REQUESTED';
ALTER TYPE "CommentIssueType" ADD VALUE 'OTHER';
-- CreateEnum
CREATE TYPE "CommentKind" AS ENUM ('EXPERIENCE', 'DISCUSSION', 'UNCLASSIFIED');

-- CreateEnum
CREATE TYPE "ExperienceSentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

-- CreateEnum
CREATE TYPE "SentimentSource" AS ENUM ('AUTHOR', 'LEGACY_RATING', 'AI', 'MODERATOR');

-- CreateEnum
CREATE TYPE "ExperienceOutcome" AS ENUM ('NO_ISSUE', 'ONGOING', 'RESOLVED', 'UNSPECIFIED');

-- CreateEnum

-- CreateEnum
CREATE TYPE "EvidenceFinding" AS ENUM ('ORDER_FOUND', 'TRANSACTION_SUPPORTED', 'REFUND_SUPPORTED', 'UNABLE_TO_CHECK', 'INCONSISTENT', 'LEGACY');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ContactCategory" ADD VALUE 'COMMENT_REPORT';

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "kind" "CommentKind" NOT NULL DEFAULT 'UNCLASSIFIED',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "ContactThread" ADD COLUMN     "commentId" INTEGER;

-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "sourceCommentId" INTEGER;

-- CreateTable
CREATE TABLE "CommentExperience" (
    "id" SERIAL NOT NULL,
    "commentId" INTEGER NOT NULL,
    "occurredMonth" VARCHAR(7),
    "sentiment" "ExperienceSentiment",
    "sentimentSource" "SentimentSource",
    "outcome" "ExperienceOutcome" NOT NULL DEFAULT 'UNSPECIFIED',
    "classifiedAt" TIMESTAMP(3),

    CONSTRAINT "CommentExperience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperienceUpdate" (
    "id" SERIAL NOT NULL,
    "experienceId" INTEGER NOT NULL,
    "commentId" INTEGER NOT NULL,
    "outcome" "ExperienceOutcome",
    "sentiment" "ExperienceSentiment",

    CONSTRAINT "ExperienceUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentRevision" (
    "id" SERIAL NOT NULL,
    "commentId" INTEGER NOT NULL,
    "authorId" INTEGER,
    "baseVersion" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "kind" "CommentKind" NOT NULL,
    "experienceData" JSONB,
    "status" "CommentStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "redactedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedById" INTEGER,

    CONSTRAINT "CommentRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentEvidence" (
    "id" SERIAL NOT NULL,
    "commentId" INTEGER,
    "authorId" INTEGER,
    "body" TEXT,
    "imagePath" TEXT,
    "legacyStatus" "PrivateProofStatus",
    "needsCheck" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "CommentEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceCheck" (
    "id" SERIAL NOT NULL,
    "evidenceId" INTEGER NOT NULL,
    "moderatorId" INTEGER,
    "finding" "EvidenceFinding" NOT NULL,
    "method" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3),
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceFileCleanup" (
    "path" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EvidenceFileCleanup_pkey" PRIMARY KEY ("path")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommentExperience_commentId_key" ON "CommentExperience"("commentId");

-- CreateIndex
CREATE INDEX "CommentExperience_sentiment_idx" ON "CommentExperience"("sentiment");

-- CreateIndex
CREATE UNIQUE INDEX "ExperienceUpdate_commentId_key" ON "ExperienceUpdate"("commentId");

-- CreateIndex
CREATE INDEX "ExperienceUpdate_experienceId_idx" ON "ExperienceUpdate"("experienceId");

-- CreateIndex
CREATE INDEX "CommentRevision_commentId_createdAt_idx" ON "CommentRevision"("commentId", "createdAt");

-- CreateIndex
CREATE INDEX "CommentRevision_status_idx" ON "CommentRevision"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CommentEvidence_imagePath_key" ON "CommentEvidence"("imagePath");

-- CreateIndex
CREATE INDEX "CommentEvidence_commentId_idx" ON "CommentEvidence"("commentId");

-- CreateIndex
CREATE INDEX "CommentEvidence_authorId_idx" ON "CommentEvidence"("authorId");

-- CreateIndex
CREATE INDEX "CommentEvidence_needsCheck_removedAt_idx" ON "CommentEvidence"("needsCheck", "removedAt");

-- CreateIndex
CREATE INDEX "EvidenceCheck_evidenceId_recordedAt_idx" ON "EvidenceCheck"("evidenceId", "recordedAt");

-- CreateIndex
CREATE INDEX "Comment_serviceId_kind_approvedAt_idx" ON "Comment"("serviceId", "kind", "approvedAt");

-- CreateIndex
CREATE INDEX "ContactThread_commentId_idx" ON "ContactThread"("commentId");

-- CreateIndex
CREATE INDEX "Case_sourceCommentId_idx" ON "Case"("sourceCommentId");

-- AddForeignKey
ALTER TABLE "CommentExperience" ADD CONSTRAINT "CommentExperience_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienceUpdate" ADD CONSTRAINT "ExperienceUpdate_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "CommentExperience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienceUpdate" ADD CONSTRAINT "ExperienceUpdate_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentRevision" ADD CONSTRAINT "CommentRevision_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentRevision" ADD CONSTRAINT "CommentRevision_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentRevision" ADD CONSTRAINT "CommentRevision_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentEvidence" ADD CONSTRAINT "CommentEvidence_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentEvidence" ADD CONSTRAINT "CommentEvidence_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceCheck" ADD CONSTRAINT "EvidenceCheck_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "CommentEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceCheck" ADD CONSTRAINT "EvidenceCheck_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactThread" ADD CONSTRAINT "ContactThread_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_sourceCommentId_fkey" FOREIGN KEY ("sourceCommentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "Comment" DISABLE TRIGGER USER;
UPDATE "Comment" c SET kind = CASE
  WHEN c."parentId" IS NOT NULL THEN 'DISCUSSION'::"CommentKind"
  WHEN EXISTS (SELECT 1 FROM "ServiceUser" su WHERE su."userId"=c."authorId" AND su."serviceId"=c."serviceId") THEN 'DISCUSSION'::"CommentKind"
  WHEN c.rating IS NOT NULL THEN 'EXPERIENCE'::"CommentKind"
  ELSE 'UNCLASSIFIED'::"CommentKind" END;
INSERT INTO "CommentExperience" ("commentId", sentiment, "sentimentSource", outcome)
SELECT id, CASE WHEN rating >= 4 THEN 'POSITIVE'::"ExperienceSentiment" WHEN rating = 3 THEN 'NEUTRAL'::"ExperienceSentiment" ELSE 'NEGATIVE'::"ExperienceSentiment" END,
  'LEGACY_RATING'::"SentimentSource", 'UNSPECIFIED'::"ExperienceOutcome"
FROM "Comment" WHERE kind='EXPERIENCE' ON CONFLICT ("commentId") DO NOTHING;
INSERT INTO "CommentRevision" ("commentId", "authorId", "baseVersion", content, kind, status, "createdAt", "decidedAt")
SELECT id, "authorId", 1, content, kind, status, "createdAt", "approvedAt" FROM "Comment" WHERE status IN ('APPROVED','VERIFIED');
INSERT INTO "CommentEvidence" ("commentId", "authorId", body, "legacyStatus", "needsCheck", "createdAt")
SELECT id, "authorId", "privateProof", "privateProofStatus", false, "createdAt" FROM "Comment" WHERE NULLIF("privateProof", '') IS NOT NULL;
-- A moderator vouched for Verified posts even when no reference was stored, so they keep an accepted older check.
INSERT INTO "CommentEvidence" ("commentId", "authorId", "legacyStatus", "needsCheck", "createdAt")
SELECT c.id, c."authorId", 'APPROVED', false, c."createdAt" FROM "Comment" c
WHERE c.status = 'VERIFIED' AND c."parentId" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "CommentEvidence" e WHERE e."commentId" = c.id AND e."legacyStatus" = 'APPROVED');
INSERT INTO "EvidenceCheck" ("evidenceId", finding, method, explanation)
SELECT id, 'LEGACY', 'Legacy order reference', 'Imported from the previous system. The check method and date were not recorded.'
FROM "CommentEvidence" WHERE "legacyStatus" IN ('APPROVED','REJECTED','WITHDRAWN');
UPDATE "Comment" SET "privateProof"=NULL, "privateProofStatus"=NULL;
ALTER TABLE "Comment" ENABLE TRIGGER USER;

-- Verified posts now carry an accepted proof check, so VERIFIED folds into APPROVED.
-- Everything tied to the old enum or to Comment.status is dropped first. The moderation
-- state and approvedAt triggers come back right after; the notification triggers further down.
DROP TRIGGER IF EXISTS trg_notify_reply_approved ON "Comment";
DROP TRIGGER IF EXISTS trg_notify_root_approved ON "Comment";
DROP TRIGGER IF EXISTS trg_notify_comment_status_changed ON "Comment";
DROP TRIGGER IF EXISTS comment_status_change_trigger ON "Comment";
DROP TRIGGER IF EXISTS comment_average_rating_trigger ON "Comment";
DROP TRIGGER IF EXISTS trigger_manage_comment_moderation_state ON "Comment";
DROP TRIGGER IF EXISTS trigger_manage_comment_approved_at ON "Comment";
DROP FUNCTION IF EXISTS calculate_comment_rating_trust(integer, boolean, boolean, "RatingMuteReason", integer, "CommentStatus", "PrivateProofStatus", integer, integer);
DROP FUNCTION IF EXISTS compute_comment_moderation_state("CommentStatus", "ModerationAction", "ModerationAction", timestamp);
ALTER TYPE "CommentStatus" RENAME TO "CommentStatus_old";
CREATE TYPE "CommentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');
ALTER TABLE "Comment" ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE "CommentStatus" USING (CASE WHEN status::text = 'VERIFIED' THEN 'APPROVED' ELSE status::text END)::"CommentStatus",
  ALTER COLUMN status SET DEFAULT 'PENDING';
ALTER TABLE "CommentRevision" ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE "CommentStatus" USING (CASE WHEN status::text = 'VERIFIED' THEN 'APPROVED' ELSE status::text END)::"CommentStatus",
  ALTER COLUMN status SET DEFAULT 'PENDING';
DROP TYPE "CommentStatus_old";

CREATE OR REPLACE FUNCTION compute_comment_moderation_state(
  p_status "CommentStatus",
  p_ai_action "ModerationAction",
  p_human_action "ModerationAction",
  p_ai_decided_at TIMESTAMP
)
RETURNS "CommentModerationState" AS $$
BEGIN
  IF p_status::text = 'WITHDRAWN' THEN
    RETURN 'RESOLVED';
  ELSIF p_human_action IN ('APPROVE', 'REJECT') THEN
    RETURN 'RESOLVED';
  ELSIF p_human_action = 'HOLD' THEN
    RETURN 'AWAITING_HUMAN';
  ELSIF p_status = 'PENDING' AND p_ai_action = 'HOLD' THEN
    RETURN 'AWAITING_HUMAN';
  ELSIF p_status = 'PENDING' AND p_ai_decided_at IS NULL THEN
    RETURN 'AWAITING_AI';
  ELSIF p_status = 'PENDING' THEN
    RETURN 'AWAITING_HUMAN';
  ELSE
    RETURN 'RESOLVED';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION manage_comment_moderation_state()
RETURNS TRIGGER AS $$
BEGIN
  NEW."moderationState" := compute_comment_moderation_state(
    NEW.status, NEW."aiAction", NEW."humanAction", NEW."aiDecidedAt"
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_manage_comment_moderation_state
BEFORE INSERT OR UPDATE OF status, "aiAction", "humanAction", "aiDecidedAt" ON "Comment"
FOR EACH ROW
EXECUTE FUNCTION manage_comment_moderation_state();

CREATE OR REPLACE FUNCTION manage_comment_approved_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'APPROVED' THEN
    IF OLD.status <> 'APPROVED' AND NEW."approvedAt" IS NULL THEN
      NEW."approvedAt" := NOW();
    END IF;
  ELSIF NEW.status::text <> 'WITHDRAWN' THEN
    NEW."approvedAt" := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_manage_comment_approved_at
BEFORE UPDATE OF status ON "Comment"
FOR EACH ROW
EXECUTE FUNCTION manage_comment_approved_at();
CREATE OR REPLACE FUNCTION remove_orphaned_comment_evidence()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."commentId" IS NULL OR NEW."removedAt" IS NOT NULL THEN
    IF OLD."imagePath" IS NOT NULL THEN
      INSERT INTO "EvidenceFileCleanup" (path) VALUES (OLD."imagePath") ON CONFLICT DO NOTHING;
    END IF;
    NEW.body := NULL;
    NEW."imagePath" := NULL;
    NEW."normalizedId" := NULL;
    NEW."removedAt" := COALESCE(NEW."removedAt", NOW());
    NEW."needsCheck" := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS remove_orphaned_comment_evidence_trigger ON "CommentEvidence";
CREATE TRIGGER remove_orphaned_comment_evidence_trigger
BEFORE UPDATE OF "commentId", "authorId", "removedAt" ON "CommentEvidence"
FOR EACH ROW EXECUTE FUNCTION remove_orphaned_comment_evidence();

CREATE OR REPLACE FUNCTION save_first_published_comment_revision()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'APPROVED' AND NOT EXISTS (
    SELECT 1 FROM "CommentRevision" WHERE "commentId" = NEW.id AND status = 'APPROVED'
  ) THEN
    INSERT INTO "CommentRevision" ("commentId", "authorId", "baseVersion", content, kind, status, "createdAt", "decidedAt", "experienceData")
    VALUES (NEW.id, NEW."authorId", NEW.version, NEW.content, NEW.kind, NEW.status, NEW."createdAt", NOW(),
      (SELECT jsonb_build_object('occurredMonth', e."occurredMonth", 'sentiment', e.sentiment, 'outcome', e.outcome)
       FROM "CommentExperience" e WHERE e."commentId" = NEW.id));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS save_first_published_comment_revision_trigger ON "Comment";
CREATE TRIGGER save_first_published_comment_revision_trigger
AFTER UPDATE OF status ON "Comment"
FOR EACH ROW EXECUTE FUNCTION save_first_published_comment_revision();

DROP TRIGGER IF EXISTS comment_rating_trust_before_write_trigger ON "Comment";
DROP TRIGGER IF EXISTS comment_average_rating_trigger ON "Comment";
DROP TRIGGER IF EXISTS user_rating_trust_trigger ON "User";
DROP TRIGGER IF EXISTS service_user_rating_trust_trigger ON "ServiceUser";

-- get_comment_moderation_context(p_comment_id)
-- Returns a single JSONB document with everything the LLM needs to moderate a comment:
-- the comment itself (with author trust signals and submission tags), the service,
-- and a context block covering cluster signals (brigade detection), recent service
-- events, calibration samples of past approved comments, affiliated-team activity,
-- and the ancestor chain when the comment is a reply.
--
-- All nested objects carry explicit temporal anchors (minutesBefore / hoursBefore /
-- daysAgo) so the LLM never has to infer recency. Empty arrays and explicit nulls
-- are preserved as "absence" signals rather than collapsed.

DROP FUNCTION IF EXISTS get_comment_moderation_context(INT);

CREATE OR REPLACE FUNCTION get_comment_moderation_context(p_comment_id INT)
RETURNS JSONB AS $$
DECLARE
    v_cluster_window         INTERVAL := '72 hours'::INTERVAL;
    v_fresh_account_window   INTERVAL := '1 hour'::INTERVAL;
    v_calibration_window     INTERVAL := '30 days'::INTERVAL;
    v_event_window           INTERVAL := '30 days'::INTERVAL;
    v_affiliated_window      INTERVAL := '7 days'::INTERVAL;
    v_similarity_threshold   FLOAT    := 0.3;
    v_max_siblings           INT      := 10;
    v_max_calibration        INT      := 5;
    v_max_affiliated         INT      := 10;
    v_max_thread_depth       INT      := 10;
    v_parent_content_limit   INT      := 2000;
    v_ancestor_content_limit INT      := 300;
    v_calibration_content_limit INT   := 400;
    v_affiliated_content_limit  INT   := 400;
    v_event_summary_limit    INT      := 200;

    v_target            RECORD;
    v_service           RECORD;
    v_author_prior_approved_service INT;
    v_author_prior_approved_total   INT;
    v_author_prior_rejected_total   INT;
    v_author_last_on_service        TIMESTAMP;
    v_comment_obj       JSONB;
    v_service_obj       JSONB;
    v_cluster_obj       JSONB;
    v_events_obj        JSONB;
    v_calibration_obj   JSONB;
    v_affiliated_obj    JSONB;
    v_cross_service_obj JSONB;
    v_thread_obj        JSONB;
    v_new_user_spike    INT;
    v_cross_service_window INTERVAL := '30 days'::INTERVAL;
    v_max_cross_service_samples INT := 5;
    v_cross_service_content_limit INT := 300;
BEGIN
    SELECT
        c.id, c.content, c."authorId", c."serviceId", c."parentId",
        c."createdAt", c.rating,
        c.issues,
        u."createdAt"   AS author_created,
        u."totalKarma"  AS author_karma,
        u.verified      AS author_verified,
        u.name          AS author_name,
        u."displayName" AS author_display_name,
        EXISTS(
            SELECT 1 FROM "ServiceUser" su
            WHERE su."userId" = c."authorId" AND su."serviceId" = c."serviceId"
        ) AS author_is_affiliated
    INTO v_target
    FROM "Comment" c
    JOIN "User" u ON u.id = c."authorId"
    WHERE c.id = p_comment_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT
        s.id, s.name, s.description, s."kycLevel",
        s."verificationStatus", s."strictCommentingEnabled"
    INTO v_service
    FROM "Service" s
    WHERE s.id = v_target."serviceId";

    SELECT
        COUNT(*) FILTER (WHERE "serviceId" = v_target."serviceId" AND status = 'APPROVED' AND id <> p_comment_id),
        COUNT(*) FILTER (WHERE status = 'APPROVED' AND id <> p_comment_id),
        COUNT(*) FILTER (WHERE status = 'REJECTED' AND id <> p_comment_id),
        MAX("createdAt") FILTER (WHERE "serviceId" = v_target."serviceId" AND status = 'APPROVED' AND id <> p_comment_id)
    INTO
        v_author_prior_approved_service,
        v_author_prior_approved_total,
        v_author_prior_rejected_total,
        v_author_last_on_service
    FROM "Comment"
    WHERE "authorId" = v_target."authorId";

    SELECT COUNT(*)
    INTO v_new_user_spike
    FROM "User" u2
    WHERE u2.id <> v_target."authorId"
      AND u2."createdAt" BETWEEN v_target.author_created - INTERVAL '1 hour'
                              AND v_target.author_created + INTERVAL '1 hour';

    v_comment_obj := jsonb_build_object(
        'content', v_target.content,
        'contentLength', LENGTH(v_target.content),
        'submission', jsonb_build_object(
            'isRootReview', v_target."parentId" IS NULL,
            'rating', v_target.rating,
            'hasPrivateProof', EXISTS (SELECT 1 FROM "CommentEvidence" WHERE "commentId" = p_comment_id AND "removedAt" IS NULL),
            'kind', (SELECT kind FROM "Comment" WHERE id = p_comment_id),
            'sentiment', (SELECT sentiment FROM "CommentExperience" WHERE "commentId" = p_comment_id),
            'issues', v_target.issues,
            'kycIssueClaimed', 'KYC_REQUESTED' = ANY(v_target.issues),
            'fundsBlockedClaimed', 'FUNDS_BLOCKED' = ANY(v_target.issues)
        ),
        'author', jsonb_build_object(
            'name', v_target.author_name,
            'displayName', v_target.author_display_name,
            'accountAgeMinutes', GREATEST(0, ROUND(EXTRACT(EPOCH FROM (v_target."createdAt" - v_target.author_created)) / 60)),
            'totalKarma', v_target.author_karma,
            'isVerified', v_target.author_verified,
            'isServiceAffiliated', v_target.author_is_affiliated,
            'priorApprovedCommentsOnThisService', v_author_prior_approved_service,
            'priorApprovedCommentsTotal', v_author_prior_approved_total,
            'priorRejectedCommentsTotal', v_author_prior_rejected_total,
            'lastCommentOnThisServiceDaysAgo',
                CASE WHEN v_author_last_on_service IS NOT NULL
                THEN ROUND((EXTRACT(EPOCH FROM (v_target."createdAt" - v_author_last_on_service)) / 86400)::numeric, 1)
                ELSE NULL END
        )
    );

    v_service_obj := jsonb_build_object(
        'name', v_service.name,
        'description', v_service.description,
        'kycLevel', v_service."kycLevel",
        'verificationStatus', v_service."verificationStatus"::TEXT,
        'strictCommentingEnabled', v_service."strictCommentingEnabled"
    );

    WITH siblings_raw AS (
        SELECT
            c.id,
            c.content,
            c."createdAt",
            c."parentId",
            u."createdAt" AS author_created,
            EXTRACT(EPOCH FROM (v_target."createdAt" - c."createdAt"))/60::FLOAT AS minutes_before,
            EXTRACT(EPOCH FROM (c."createdAt" - u."createdAt"))/60::FLOAT AS author_age_at_write_min,
            similarity(c.content, v_target.content) AS sim
        FROM "Comment" c
        JOIN "User" u ON u.id = c."authorId"
        WHERE c."serviceId" = v_target."serviceId"
          AND c.id <> p_comment_id
          AND c."createdAt" >= v_target."createdAt" - v_cluster_window
          AND c."createdAt" <= v_target."createdAt"
          AND (c."createdAt" - u."createdAt") < v_fresh_account_window
    ),
    siblings_top AS (
        SELECT *
        FROM siblings_raw
        ORDER BY sim DESC NULLS LAST, minutes_before ASC
        LIMIT v_max_siblings
    )
    SELECT jsonb_build_object(
        'freshAccountsLast72h', (SELECT COUNT(*) FROM siblings_raw),
        'similarCommentsCount', (SELECT COUNT(*) FROM siblings_raw WHERE sim > v_similarity_threshold),
        'similarityMax', COALESCE((SELECT ROUND(MAX(sim)::numeric, 2) FROM siblings_raw), 0),
        'newUserCreationSpikeNearAuthor', v_new_user_spike,
        'siblings', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', st.id,
                'minutesBefore', ROUND(st.minutes_before),
                'authorAccountAgeAtWriteMinutes', GREATEST(0, ROUND(st.author_age_at_write_min)),
                'similarity', ROUND(st.sim::numeric, 2),
                'isReply', st."parentId" IS NOT NULL,
                'content', st.content
            ) ORDER BY st.sim DESC NULLS LAST, st.minutes_before ASC)
            FROM siblings_top st
        ), '[]'::jsonb)
    )
    INTO v_cluster_obj;

    SELECT COALESCE(jsonb_agg(ev ORDER BY (ev->>'daysAgo')::int ASC), '[]'::jsonb)
    INTO v_events_obj
    FROM (
        SELECT jsonb_build_object(
            'id', e.id,
            'daysAgo', ROUND(EXTRACT(EPOCH FROM (v_target."createdAt" - e."startedAt"))/86400),
            'type', e.type::TEXT,
            'title', e.title,
            'isOngoing', e."endedAt" IS NULL,
            'summary', LEFT(e.content, v_event_summary_limit)
        ) AS ev
        FROM "Event" e
        WHERE e."serviceId" = v_target."serviceId"
          AND e.visible = TRUE
          AND e."startedAt" >= v_target."createdAt" - v_event_window
          AND e."startedAt" <= v_target."createdAt"
    ) ev_rows;

    WITH calibration_samples AS (
        SELECT
            c.id, c.content, c.rating,
            ROUND((EXTRACT(EPOCH FROM (v_target."createdAt" - c."createdAt"))/86400)::numeric, 1) AS days_ago
        FROM "Comment" c
        WHERE c."serviceId" = v_target."serviceId"
          AND c.status = 'APPROVED'
          AND c."parentId" IS NULL
          AND c.id <> p_comment_id
          AND c."ratingMuted" = FALSE
          AND c."createdAt" >= v_target."createdAt" - v_calibration_window
          AND c."createdAt" <= v_target."createdAt"
        ORDER BY c."createdAt" DESC
        LIMIT v_max_calibration
    )
    SELECT
        CASE
            WHEN EXISTS (SELECT 1 FROM calibration_samples) THEN
                jsonb_build_object(
                    'samples', (
                        SELECT jsonb_agg(jsonb_build_object(
                            'id', cs.id,
                            'daysAgo', cs.days_ago,
                            'rating', cs.rating,
                            'content', LEFT(cs.content, v_calibration_content_limit)
                        ) ORDER BY cs.days_ago ASC)
                        FROM calibration_samples cs
                    ),
                    'lastApprovedCommentDaysAgo', NULL
                )
            ELSE
                jsonb_build_object(
                    'samples', '[]'::jsonb,
                    'lastApprovedCommentDaysAgo', (
                        SELECT ROUND((EXTRACT(EPOCH FROM (v_target."createdAt" - MAX(c."createdAt")))/86400)::numeric, 1)
                        FROM "Comment" c
                        WHERE c."serviceId" = v_target."serviceId"
                          AND c.status = 'APPROVED'
                          AND c."parentId" IS NULL
                          AND c.id <> p_comment_id
                    )
                )
        END
    INTO v_calibration_obj;

    WITH team AS (
        SELECT u.name, u."displayName", su.role
        FROM "ServiceUser" su
        JOIN "User" u ON u.id = su."userId"
        WHERE su."serviceId" = v_target."serviceId"
    ),
    recent AS (
        SELECT
            c.id, c.content, c."parentId" AS reply_to, c."createdAt",
            u.name AS author_name, u."displayName" AS author_display_name, su.role,
            ROUND((EXTRACT(EPOCH FROM (v_target."createdAt" - c."createdAt"))/3600)::numeric, 1) AS hours_before,
            similarity(c.content, v_target.content) AS sim
        FROM "Comment" c
        JOIN "User" u ON u.id = c."authorId"
        JOIN "ServiceUser" su ON su."userId" = c."authorId" AND su."serviceId" = c."serviceId"
        WHERE c."serviceId" = v_target."serviceId"
          AND c.id <> p_comment_id
          AND c."createdAt" >= v_target."createdAt" - v_affiliated_window
          AND c."createdAt" <= v_target."createdAt"
        ORDER BY c."createdAt" DESC
        LIMIT v_max_affiliated
    )
    SELECT jsonb_build_object(
        'team', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'name', t.name,
                'displayName', t."displayName",
                'role', t.role::TEXT
            ) ORDER BY t.role::TEXT, t.name)
            FROM team t
        ), '[]'::jsonb),
        'recentComments', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', r.id,
                'hoursBefore', r.hours_before,
                'author', jsonb_build_object(
                    'name', r.author_name,
                    'displayName', r.author_display_name,
                    'role', r.role::TEXT
                ),
                'isReplyTo', r.reply_to,
                'similarity', ROUND(r.sim::numeric, 2),
                'content', LEFT(r.content, v_affiliated_content_limit)
            ) ORDER BY r."createdAt" DESC)
            FROM recent r
        ), '[]'::jsonb)
    )
    INTO v_affiliated_obj;

    WITH author_cross_service AS (
        SELECT
            c.id,
            c."serviceId",
            c.content,
            c.status,
            c."createdAt",
            s.slug AS service_slug,
            ROUND((EXTRACT(EPOCH FROM (v_target."createdAt" - c."createdAt"))/86400)::numeric, 1) AS days_ago,
            similarity(c.content, v_target.content) AS sim
        FROM "Comment" c
        JOIN "Service" s ON s.id = c."serviceId"
        WHERE c."authorId" = v_target."authorId"
          AND c.id <> p_comment_id
          AND c."serviceId" <> v_target."serviceId"
          AND c."createdAt" >= v_target."createdAt" - v_cross_service_window
          AND c."createdAt" <= v_target."createdAt"
    ),
    author_cross_top AS (
        SELECT *
        FROM author_cross_service
        ORDER BY sim DESC NULLS LAST, "createdAt" DESC
        LIMIT v_max_cross_service_samples
    )
    SELECT jsonb_build_object(
        'commentsOnOtherServicesLast30d', (SELECT COUNT(*) FROM author_cross_service),
        'commentsOnOtherServicesLast7d', (SELECT COUNT(*) FROM author_cross_service WHERE days_ago <= 7),
        'distinctOtherServicesLast30d', (SELECT COUNT(DISTINCT "serviceId") FROM author_cross_service),
        'distinctOtherServicesLast7d', (SELECT COUNT(DISTINCT "serviceId") FROM author_cross_service WHERE days_ago <= 7),
        'rejectedOnOtherServicesLast30d', (SELECT COUNT(*) FROM author_cross_service WHERE status = 'REJECTED'),
        'similarityMaxOnOtherServices', COALESCE((SELECT ROUND(MAX(sim)::numeric, 2) FROM author_cross_service), 0),
        'samples', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', t.id,
                'serviceSlug', t.service_slug,
                'daysAgo', t.days_ago,
                'similarity', ROUND(t.sim::numeric, 2),
                'status', t.status::TEXT,
                'content', LEFT(t.content, v_cross_service_content_limit)
            ) ORDER BY t.sim DESC NULLS LAST, t.days_ago ASC)
            FROM author_cross_top t
        ), '[]'::jsonb)
    )
    INTO v_cross_service_obj;

    IF v_target."parentId" IS NOT NULL THEN
        WITH RECURSIVE ancestors AS (
            SELECT
                c.id, c.content, c.rating, c."parentId", c."createdAt", c."authorId",
                1 AS depth
            FROM "Comment" c
            WHERE c.id = v_target."parentId"
            UNION ALL
            SELECT
                c.id, c.content, c.rating, c."parentId", c."createdAt", c."authorId",
                a.depth + 1
            FROM "Comment" c
            JOIN ancestors a ON c.id = a."parentId"
            WHERE a.depth < v_max_thread_depth
        ),
        ancestors_enriched AS (
            SELECT
                a.id, a.content, a.rating, a."parentId", a."createdAt", a.depth,
                u.name AS author_name,
                u."displayName" AS author_display_name,
                u."createdAt" AS author_created,
                u."totalKarma" AS author_karma,
                u.verified AS author_verified,
                su.role
            FROM ancestors a
            JOIN "User" u ON u.id = a."authorId"
            LEFT JOIN "ServiceUser" su ON su."userId" = a."authorId" AND su."serviceId" = v_target."serviceId"
        )
        SELECT jsonb_build_object(
            'depth', (SELECT MAX(depth) FROM ancestors_enriched),
            'ancestors', COALESCE(jsonb_agg(jsonb_build_object(
                'id', ae.id,
                'position',
                    CASE
                        WHEN ae."parentId" IS NULL THEN 'root'
                        WHEN ae.depth = 1 THEN 'parent'
                        ELSE 'ancestor-' || ae.depth::TEXT
                    END,
                'minutesBefore', ROUND(EXTRACT(EPOCH FROM (v_target."createdAt" - ae."createdAt"))/60),
                'rating', ae.rating,
                'content',
                    CASE
                        WHEN ae.depth = 1 THEN LEFT(ae.content, v_parent_content_limit)
                        ELSE LEFT(ae.content, v_ancestor_content_limit)
                    END,
                'author', jsonb_build_object(
                    'name', ae.author_name,
                    'displayName', ae.author_display_name,
                    'accountAgeMinutes', GREATEST(0, ROUND(EXTRACT(EPOCH FROM (ae."createdAt" - ae.author_created))/60)),
                    'totalKarma', ae.author_karma,
                    'isVerified', ae.author_verified,
                    'isServiceAffiliated', ae.role IS NOT NULL,
                    'role', ae.role::TEXT
                )
            ) ORDER BY ae.depth DESC), '[]'::jsonb)
        )
        INTO v_thread_obj
        FROM ancestors_enriched ae;

        v_comment_obj := v_comment_obj || jsonb_build_object('thread', v_thread_obj);
    END IF;

    RETURN jsonb_build_object(
        'comment', v_comment_obj,
        'service', v_service_obj,
        'context', jsonb_build_object(
            'clusterSignals', v_cluster_obj,
            'authorCrossServicePattern', v_cross_service_obj,
            'recentEvents', v_events_obj,
            'calibration', v_calibration_obj,
            'affiliatedActivity', v_affiliated_obj
        )
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Function & Trigger for Root Comment Insertions (Approved/Verified)
CREATE OR REPLACE FUNCTION notify_root_comment_inserted()
RETURNS TRIGGER AS $$
DECLARE
  watcher_count INT;
BEGIN
  RAISE NOTICE '[notify_root_comment_inserted] Trigger fired for comment ID: %', NEW.id;
  WITH watchers AS (
    SELECT np."userId", np."enableNotifyPendingRepliesOnWatch"
    FROM "_onRootCommentCreatedForServices" rc
    JOIN "NotificationPreferences" np ON rc."A" = np."id"
    WHERE rc."B" = NEW."serviceId"
      AND np."userId" <> NEW."authorId"
      AND EXISTS (
        SELECT 1 FROM "Service" s
        WHERE s.id = NEW."serviceId" AND s."serviceVisibility"::text IN ('PUBLIC', 'ARCHIVED', 'UNLISTED')
      )
  )
  INSERT INTO "Notification" ("userId", "type", "aboutCommentId")
  SELECT w."userId",
        'ROOT_COMMENT_CREATED',
        NEW."id"
  FROM watchers w
  WHERE (
    NEW.status = 'APPROVED'
  )
  ON CONFLICT DO NOTHING;

  RAISE NOTICE '[notify_root_comment_inserted] Inserted % notifications for comment ID: %', FOUND, NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_root_comment_inserted ON "Comment";
CREATE TRIGGER trg_notify_root_comment_inserted
  AFTER INSERT ON "Comment"
  FOR EACH ROW
  WHEN (NEW."parentId" IS NULL)
  EXECUTE FUNCTION notify_root_comment_inserted();

-- Function & Trigger for Reply Comment Insertions
CREATE OR REPLACE FUNCTION notify_reply_comment_inserted()
RETURNS TRIGGER AS $$
BEGIN
  WITH watchers AS (
    SELECT np."userId", np."enableNotifyPendingRepliesOnWatch"
    FROM "_watchedComments" w
    JOIN "NotificationPreferences" np ON w."B" = np."id"
    WHERE w."A" = NEW."parentId"
      AND np."userId" <> NEW."authorId"
      AND EXISTS (
        SELECT 1 FROM "Service" s
        WHERE s.id = NEW."serviceId" AND s."serviceVisibility"::text IN ('PUBLIC', 'ARCHIVED', 'UNLISTED')
      )
  )
  INSERT INTO "Notification" ("userId", "type", "aboutCommentId")
  SELECT w."userId",
        'REPLY_COMMENT_CREATED',
        NEW."id"
  FROM watchers w
  WHERE (
    NEW.status = 'APPROVED'
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_reply_comment_inserted ON "Comment";
CREATE TRIGGER trg_notify_reply_comment_inserted
  AFTER INSERT ON "Comment"
  FOR EACH ROW
  WHEN (NEW."parentId" IS NOT NULL)
  EXECUTE FUNCTION notify_reply_comment_inserted();

-- Function & Trigger for Reply Approval/Verification
CREATE OR REPLACE FUNCTION notify_reply_approved()
RETURNS TRIGGER AS $$
BEGIN
  WITH watchers AS (
    SELECT np."userId"
    FROM "_watchedComments" w
    JOIN "NotificationPreferences" np ON w."B" = np."id"
    WHERE w."A" = NEW."parentId"
      AND np."userId" <> NEW."authorId"
      AND EXISTS (
        SELECT 1 FROM "Service" s
        WHERE s.id = NEW."serviceId" AND s."serviceVisibility"::text IN ('PUBLIC', 'ARCHIVED', 'UNLISTED')
      )
  )
  INSERT INTO "Notification" ("userId", "type", "aboutCommentId")
  SELECT w."userId",
        'REPLY_COMMENT_CREATED',
        NEW."id"
  FROM watchers w
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_reply_approved ON "Comment";
CREATE TRIGGER trg_notify_reply_approved
  AFTER UPDATE OF status ON "Comment"
  FOR EACH ROW
  WHEN (NEW."parentId" IS NOT NULL AND NEW.status = 'APPROVED' AND OLD.status::text NOT IN ('APPROVED', 'WITHDRAWN'))
  EXECUTE FUNCTION notify_reply_approved();

DROP TRIGGER IF EXISTS trg_notify_root_approved ON "Comment";

CREATE OR REPLACE FUNCTION notify_root_approved()
RETURNS TRIGGER AS $$
BEGIN
  WITH watchers AS (
    SELECT np."userId"
    FROM "_onRootCommentCreatedForServices" rc
    JOIN "NotificationPreferences" np ON rc."A" = np."id"
    WHERE rc."B" = NEW."serviceId"
      AND np."userId" <> NEW."authorId"
      AND EXISTS (
        SELECT 1 FROM "Service" s
        WHERE s.id = NEW."serviceId" AND s."serviceVisibility"::text IN ('PUBLIC', 'ARCHIVED', 'UNLISTED')
      )
  )
  INSERT INTO "Notification" ("userId", "type", "aboutCommentId")
  SELECT w."userId",
        'ROOT_COMMENT_CREATED',
        NEW."id"
  FROM watchers w
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_root_approved
  AFTER UPDATE OF status ON "Comment"
  FOR EACH ROW
  WHEN (NEW."parentId" IS NULL AND NEW.status = 'APPROVED' AND OLD.status::text NOT IN ('APPROVED', 'WITHDRAWN'))
  EXECUTE FUNCTION notify_root_approved();

-- Function & Trigger for Comment Status Changes (status, rating mute, humanAction)
CREATE OR REPLACE FUNCTION notify_comment_status_changed()
RETURNS TRIGGER AS $$
DECLARE
  v_status_change "CommentStatusChange" := NULL;
  v_was_penalty BOOLEAN;
  v_is_penalty  BOOLEAN;
BEGIN
  -- Penalty-bearing mute states (SUSPICIOUS_PATTERN / TEMPLATE_SPAM) carry
  -- "marked as spam" semantics; other mute reasons (affiliation, conflict,
  -- moderator discretion) do not trigger user-facing spam notifications.
  v_was_penalty := COALESCE(OLD."ratingMuted", false)
                   AND OLD."ratingMuteReason"::text IN ('SUSPICIOUS_PATTERN', 'TEMPLATE_SPAM');
  v_is_penalty  := COALESCE(NEW."ratingMuted", false)
                   AND NEW."ratingMuteReason"::text IN ('SUSPICIOUS_PATTERN', 'TEMPLATE_SPAM');

  -- Withdrawing and restoring are the author's own moves, so nobody is told about them.
  IF NEW.status::text = 'WITHDRAWN' OR OLD.status::text = 'WITHDRAWN' THEN
    NULL;
  ELSIF NEW.status <> OLD.status THEN
    IF NEW.status = 'APPROVED' THEN v_status_change := 'STATUS_CHANGED_TO_APPROVED';
    ELSIF NEW.status = 'REJECTED' THEN v_status_change := 'STATUS_CHANGED_TO_REJECTED';
    ELSIF NEW.status = 'PENDING' AND OLD.status <> 'PENDING' THEN v_status_change := 'STATUS_CHANGED_TO_PENDING';
    END IF;
  ELSIF v_was_penalty <> v_is_penalty THEN
    v_status_change := CASE WHEN v_is_penalty THEN 'MARKED_AS_SPAM' ELSE 'UNMARKED_AS_SPAM' END;
  ELSIF NEW."humanAction" IS DISTINCT FROM OLD."humanAction" THEN
    IF NEW."humanAction" = 'HOLD' AND OLD."humanAction" IS DISTINCT FROM 'HOLD' THEN
      v_status_change := 'MARKED_FOR_ADMIN_REVIEW';
    ELSIF OLD."humanAction" = 'HOLD' AND NEW."humanAction" IS DISTINCT FROM 'HOLD' THEN
      v_status_change := 'UNMARKED_FOR_ADMIN_REVIEW';
    END IF;
  END IF;

  IF v_status_change IS NOT NULL THEN
    WITH watchers AS (
      SELECT np."userId"
      FROM "_watchedComments" w
      JOIN "NotificationPreferences" np ON w."B" = np."id"
      WHERE w."A" = NEW."id"
        AND np."userId" <> NEW."authorId"
        AND np."enableOnMyCommentStatusChange"
        AND NEW.status = 'APPROVED'

      UNION ALL

      SELECT np."userId"
      FROM "NotificationPreferences" np
      WHERE np."userId" = NEW."authorId"
        AND np."enableOnMyCommentStatusChange"
    )
    INSERT INTO "Notification" ("userId", "type", "aboutCommentId", "aboutCommentStatusChange")
    SELECT w."userId",
          'COMMENT_STATUS_CHANGE',
          NEW."id",
          v_status_change
    FROM watchers w
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_comment_status_changed ON "Comment";
CREATE TRIGGER trg_notify_comment_status_changed
  AFTER UPDATE OF status, "ratingMuted", "ratingMuteReason", "humanAction" ON "Comment"
  FOR EACH ROW
  WHEN (
    NEW.status <> OLD.status
    OR NEW."ratingMuted" IS DISTINCT FROM OLD."ratingMuted"
    OR NEW."ratingMuteReason" IS DISTINCT FROM OLD."ratingMuteReason"
    OR NEW."humanAction" IS DISTINCT FROM OLD."humanAction"
  )
  EXECUTE FUNCTION notify_comment_status_changed();

-- Function & Trigger for Community Note Added
CREATE OR REPLACE FUNCTION notify_community_note_added()
RETURNS TRIGGER AS $$
BEGIN
  -- Only a published post with an author has anyone to tell.
  IF NEW.status::text <> 'APPROVED' OR NEW."authorId" IS NULL THEN
    RETURN NEW;
  END IF;
  -- Notify watchers of this specific comment (excluding author)
  WITH watchers AS (
    SELECT np."userId"
    FROM "_watchedComments" w
    JOIN "NotificationPreferences" np ON w."B" = np."id"
    WHERE w."A" = NEW."id"
      AND np."userId" <> NEW."authorId"
  )
  INSERT INTO "Notification" ("userId", "type", "aboutCommentId")
  SELECT w."userId",
        'COMMUNITY_NOTE_ADDED',
        NEW."id"
  FROM watchers w
  ON CONFLICT DO NOTHING;

  -- Always notify the author
  INSERT INTO "Notification" ("userId", "type", "aboutCommentId")
  VALUES (NEW."authorId", 'COMMUNITY_NOTE_ADDED', NEW."id")
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_community_note_added ON "Comment";
CREATE TRIGGER trg_notify_community_note_added
  AFTER UPDATE OF "publicNote" ON "Comment"
  FOR EACH ROW
  WHEN (NEW."publicNote" IS NOT NULL AND NEW."publicNote" <> '' AND (OLD."publicNote" IS NULL OR OLD."publicNote" = ''))
  EXECUTE FUNCTION notify_community_note_added();

-- Remove the old monolithic trigger and function definition if they still exist
DROP TRIGGER IF EXISTS comment_notifications_trigger ON "Comment";
DROP FUNCTION IF EXISTS trigger_comment_notifications();

COMMIT;

-- ==== comment decision reason ====

-- One list of rules for moderator decisions, AI rejections and reports.
CREATE TYPE "CommentRule" AS ENUM ('SPAM', 'SCAM_CONTACT', 'HARASSMENT', 'SLUR', 'PRIVATE_INFO', 'NOT_GENUINE', 'DUPLICATE', 'NO_LONGER_APPLIES', 'OFF_TOPIC', 'NOT_ENOUGH_DETAIL', 'OTHER');

ALTER TABLE "Comment" ADD COLUMN "humanDecisionReason" "CommentRule";
ALTER TABLE "Comment" ADD COLUMN "aiDecisionReason" "CommentRule";
ALTER TABLE "CommentRevision" ADD COLUMN "aiAction" "ModerationAction",
  ADD COLUMN "aiDecidedAt" TIMESTAMP(3),
  ADD COLUMN "aiReasoning" TEXT,
  ADD COLUMN "decisionRule" "CommentRule";

CREATE INDEX "Comment_humanDecisionReason_idx" ON "Comment"("humanDecisionReason");

WITH labels(reason, label) AS (
  VALUES
    ('SPAM'::"CommentRule", 'Spam or advertising'),
    ('SCAM_CONTACT'::"CommentRule", 'Scam or unsolicited contact details'),
    ('HARASSMENT'::"CommentRule", 'Harassment or threats'),
    ('SLUR'::"CommentRule", 'Slur or abusive language'),
    ('PRIVATE_INFO'::"CommentRule", 'Private information'),
    ('OFF_TOPIC'::"CommentRule", 'Off-topic'),
    ('OTHER'::"CommentRule", 'Needs another moderator'),
    ('OTHER'::"CommentRule", 'Other')
)
UPDATE "Comment" c
SET
  "humanDecisionReason" = labels.reason,
  "humanReasoning" = NULLIF(BTRIM(SUBSTRING(c."humanReasoning" FROM LENGTH(labels.label) + 1), ': '), '')
FROM labels
WHERE c."humanReasoning" = labels.label OR c."humanReasoning" LIKE labels.label || ': %';

UPDATE "Comment"
SET "humanReasoning" = NULL
WHERE "humanAction" = 'APPROVE' AND "humanReasoning" = 'Approved for publication.';

-- ==== comment reply to ====

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN "replyToId" INTEGER;

-- CreateIndex
CREATE INDEX "Comment_replyToId_idx" ON "Comment"("replyToId");

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Flatten nested replies: each reply moves under its root post and keeps the
-- comment it answered as replyToId.
WITH RECURSIVE thread AS (
  SELECT id, id AS "rootId" FROM "Comment" WHERE "parentId" IS NULL
  UNION ALL
  SELECT c.id, thread."rootId" FROM "Comment" c JOIN thread ON c."parentId" = thread.id
)
UPDATE "Comment" c
SET "replyToId" = c."parentId", "parentId" = thread."rootId"
FROM thread, "Comment" parent
WHERE thread.id = c.id AND parent.id = c."parentId" AND parent."parentId" IS NOT NULL;

-- ==== evidence proof kinds ====

-- CreateEnum
CREATE TYPE "EvidenceKind" AS ENUM ('ORDER_ID', 'LOOKUP_LINK', 'TRANSACTION_ID', 'EXTERNAL_LINK', 'SCREENSHOT', 'NOTE');

-- AlterEnum
ALTER TYPE "EvidenceFinding" ADD VALUE 'SCREENSHOT_REVIEWED';

-- AlterTable
ALTER TABLE "CommentEvidence" ADD COLUMN     "formatValid" BOOLEAN,
ADD COLUMN     "kind" "EvidenceKind" NOT NULL DEFAULT 'NOTE',
ADD COLUMN     "normalizedId" TEXT;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "proofHint" TEXT,
ADD COLUMN     "proofIdPattern" TEXT,
ADD COLUMN     "proofLookupUrl" TEXT;

-- Every comment section message was a proof instruction, so it becomes the service's proof hint.
UPDATE "Service" SET "proofHint" = left(btrim("commentSectionMessage"), 300)
WHERE btrim(COALESCE("commentSectionMessage", '')) <> '';
ALTER TABLE "Service" DROP COLUMN "commentSectionMessage";

-- Backfill with the app's rules for evidence saved before services had proof
-- settings: screenshots first, then transaction IDs and addresses, other links,
-- order-ID-shaped text, and free text.
UPDATE "CommentEvidence" SET "kind" = CASE
  WHEN "imagePath" IS NOT NULL THEN 'SCREENSHOT'::"EvidenceKind"
  WHEN btrim("body") ~* '^(0x)?[0-9a-f]{64}$'
    OR btrim("body") ~* '^0x[0-9a-f]{40}$'
    OR btrim("body") ~* '^(bc1|tb1|ltc1)[0-9a-z]{25,90}$'
    OR btrim("body") ~ '^[13][1-9A-HJ-NP-Za-km-z]{25,34}$'
    OR btrim("body") ~ '^[48][1-9A-HJ-NP-Za-km-z]{94,105}$' THEN 'TRANSACTION_ID'::"EvidenceKind"
  WHEN btrim("body") ~* '^https?://\S+$' THEN 'EXTERNAL_LINK'::"EvidenceKind"
  WHEN btrim("body") ~ '^[A-Za-z0-9_-]{3,64}$' THEN 'ORDER_ID'::"EvidenceKind"
  ELSE 'NOTE'::"EvidenceKind"
END;
UPDATE "CommentEvidence" SET "normalizedId" = btrim("body") WHERE "kind" = 'ORDER_ID';
UPDATE "CommentEvidence" SET "formatValid" = false WHERE "kind" = 'TRANSACTION_ID';

-- ==== proof data cleanup ====

-- Evidence that no human ever checked is waiting for a check, including
-- legacy references imported without a decision. Rejected posts don't need one.
UPDATE "CommentEvidence" e SET "needsCheck" = true
WHERE e."removedAt" IS NULL
  AND EXISTS (SELECT 1 FROM "Comment" c WHERE c.id = e."commentId" AND c.status <> 'REJECTED')
  AND NOT EXISTS (SELECT 1 FROM "EvidenceCheck" c WHERE c."evidenceId" = e.id);

-- Unclassified posts that report KYC or blocked funds describe using the
-- service, so they are experiences. Sentiment stays unknown.
UPDATE "Comment" SET kind = 'EXPERIENCE'
WHERE kind = 'UNCLASSIFIED' AND "parentId" IS NULL AND cardinality(issues) > 0;
INSERT INTO "CommentExperience" ("commentId")
SELECT c.id FROM "Comment" c
WHERE c.kind = 'EXPERIENCE' AND c."parentId" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "CommentExperience" e WHERE e."commentId" = c.id);

-- Moderators keep text removal after it moved to its own capability.
UPDATE "User" SET capabilities = array_append(capabilities, 'comments:redact')
WHERE 'comments:moderate' = ANY(capabilities) AND NOT 'comments:redact' = ANY(capabilities);

-- ==== comment report reasons ====

-- CreateEnum
CREATE TYPE "CommentReportOutcome" AS ENUM ('ACTION_TAKEN', 'NO_ACTION');

-- AlterTable
ALTER TABLE "ContactThread" ADD COLUMN "fromService" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "reportOutcome" "CommentReportOutcome",
ADD COLUMN "reportOutcomeNote" TEXT,
ADD COLUMN "reportReason" "CommentRule";

-- ==== retired columns ====

-- The private proof moved to CommentEvidence, rating mutes and content flags are retired, and nothing
-- reads the rating weights or the sentiment summary. These triggers fire on the dropped columns; the
-- trigger import that follows every deploy recreates the current versions.
DROP TRIGGER IF EXISTS trg_notify_comment_status_changed ON "Comment";
DROP TRIGGER IF EXISTS comment_rating_mute_change_trigger ON "Comment";

-- Published experiences the old system muted as a suspicious pattern but that have checked proof go to
-- the human queue once, staying published (status-change notifications are off at this point).
UPDATE "Comment" c SET "humanAction" = 'HOLD'
WHERE c."ratingMuteReason" = 'SUSPICIOUS_PATTERN'
  AND c.status = 'APPROVED' AND c."parentId" IS NULL AND c.kind = 'EXPERIENCE'
  AND EXISTS (
    SELECT 1 FROM "CommentEvidence" e
    WHERE e."commentId" = c.id AND e."removedAt" IS NULL
      AND (
        SELECT CASE
          WHEN k.finding = 'LEGACY' THEN e."legacyStatus" IS NOT DISTINCT FROM 'APPROVED'
          ELSE k.finding::text IN ('ORDER_FOUND', 'SCREENSHOT_REVIEWED', 'TRANSACTION_SUPPORTED', 'REFUND_SUPPORTED')
        END
        FROM "EvidenceCheck" k WHERE k."evidenceId" = e.id ORDER BY k."recordedAt" DESC, k.id DESC LIMIT 1
      )
  );

-- Leftovers of the retired rating weights; no trigger or code calls them.
DROP FUNCTION IF EXISTS calculate_average_rating();
DROP FUNCTION IF EXISTS recalculate_service_user_rating(integer);
DROP FUNCTION IF EXISTS refresh_service_user_comment_rating_trust();
DROP FUNCTION IF EXISTS refresh_user_comment_rating_trust();
DROP FUNCTION IF EXISTS set_comment_rating_trust_before_write();

-- DropIndex
DROP INDEX "Comment_ratingActive_idx";

-- DropIndex
DROP INDEX "Comment_ratingMuted_idx";

-- DropIndex
DROP INDEX "Comment_ratingWeight_idx";

-- DropIndex
DROP INDEX "Comment_serviceId_privateProof_key";

-- AlterTable
ALTER TABLE "Comment" DROP COLUMN "privateProof",
DROP COLUMN "privateProofStatus",
DROP COLUMN "ratingActive",
DROP COLUMN "ratingMuteReason",
DROP COLUMN "ratingMuted",
DROP COLUMN "ratingTrustLabel",
DROP COLUMN "ratingTrustReason",
DROP COLUMN "ratingWeight";

-- DropEnum
DROP TYPE "RatingMuteReason";

-- AlterTable
ALTER TABLE "Service" DROP COLUMN "userSentiment",
DROP COLUMN "userSentimentAt";

-- DropIndex
DROP INDEX "Service_averageUserRating_idx";

-- DropIndex
DROP INDEX "Service_trustWeightedUserRating_idx";

-- DropIndex
DROP INDEX "Service_userRatingCount_idx";

-- DropIndex
DROP INDEX "Service_trustedUserRatingCount_idx";

-- AlterTable
ALTER TABLE "NotificationPreferences" DROP COLUMN "enableNotifyPendingRepliesOnWatch";

-- AlterTable
ALTER TABLE "Service" DROP COLUMN "averageUserRating",
DROP COLUMN "trustWeightedUserRating",
DROP COLUMN "trustedUserRatingCount",
DROP COLUMN "userRatingCount",
DROP COLUMN "userRatingWeight";

-- ==== timestamp backfills ====

-- Published posts from before approvedAt existed get their creation time, so re-saving them doesn't stamp now.
UPDATE "Comment" SET "approvedAt" = "createdAt"
WHERE status = 'APPROVED' AND "approvedAt" IS NULL;

-- Only listed services keep a listing time, and verified services always have a verification time.
UPDATE "Service" SET "listedAt" = NULL
WHERE "serviceVisibility" NOT IN ('PUBLIC', 'ARCHIVED') AND "listedAt" IS NOT NULL;
UPDATE "Service" SET "listedAt" = COALESCE("approvedAt", "createdAt")
WHERE "serviceVisibility" IN ('PUBLIC', 'ARCHIVED') AND "listedAt" IS NULL;
UPDATE "Service" SET "verifiedAt" = COALESCE("approvedAt", "createdAt")
WHERE "verificationStatus" = 'VERIFICATION_SUCCESS' AND "verifiedAt" IS NULL;

-- ==== karma history ====

-- Deleting a comment or suggestion keeps the karma it earned and its record, so a user's total always
-- equals the sum of their transactions.
ALTER TABLE "KarmaTransaction" DROP CONSTRAINT "KarmaTransaction_commentId_fkey";
ALTER TABLE "KarmaTransaction" DROP CONSTRAINT "KarmaTransaction_suggestionId_fkey";
ALTER TABLE "KarmaTransaction" ADD CONSTRAINT "KarmaTransaction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KarmaTransaction" ADD CONSTRAINT "KarmaTransaction_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "ServiceSuggestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ==== deploy window ====

-- These triggers and functions read columns dropped above. Until the trigger import that follows the
-- migration recreates the current versions, comment inserts and status changes would fail on them, so
-- they go here: writes succeed and only skip notifications and karma for that short window.
DROP TRIGGER IF EXISTS trg_notify_root_comment_inserted ON "Comment";
DROP TRIGGER IF EXISTS trg_notify_reply_comment_inserted ON "Comment";
DROP TRIGGER IF EXISTS comment_status_change_trigger ON "Comment";
DROP FUNCTION IF EXISTS notify_root_comment_inserted();
DROP FUNCTION IF EXISTS notify_reply_comment_inserted();
DROP FUNCTION IF EXISTS notify_comment_status_changed();
DROP FUNCTION IF EXISTS handle_comment_status_change();
DROP FUNCTION IF EXISTS handle_rating_mute_change(record, record);
DROP FUNCTION IF EXISTS get_comment_moderation_context(integer);

-- ==== karma retired ====

-- Karma is no longer written (prisma/triggers/01_comment_votes.sql); the ledger stays as frozen history.
-- The vote triggers write karmaApplied, so they go first; the trigger import recreates the vote count.
DROP TRIGGER IF EXISTS set_comment_vote_karma_trigger ON "CommentVote";
DROP TRIGGER IF EXISTS comment_vote_change_trigger ON "CommentVote";
DROP FUNCTION IF EXISTS set_comment_vote_karma();
DROP FUNCTION IF EXISTS handle_comment_vote_change();
ALTER TABLE "CommentVote" DROP COLUMN "karmaApplied";

-- ==== karma notifications retired ====

DROP TRIGGER IF EXISTS karma_notifications_trigger ON "KarmaTransaction";
DROP FUNCTION IF EXISTS trigger_karma_notifications();
DELETE FROM "Notification" WHERE type = 'KARMA_CHANGE';
ALTER TABLE "Notification" DROP COLUMN "aboutKarmaTransactionId";
ALTER TABLE "NotificationPreferences" DROP COLUMN "karmaNotificationThreshold";
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
CREATE TYPE "NotificationType" AS ENUM ('COMMENT_EDIT_REVIEWED', 'COMMENT_EVIDENCE_CHECKED', 'COMMENT_PROOF_REQUESTED', 'TEST', 'COMMENT_STATUS_CHANGE', 'REPLY_COMMENT_CREATED', 'COMMUNITY_NOTE_ADDED', 'ROOT_COMMENT_CREATED', 'SUGGESTION_CREATED', 'SUGGESTION_MESSAGE', 'SUGGESTION_STATUS_CHANGE', 'CONTACT_MESSAGE', 'CONTACT_SEEN', 'CONTACT_RESOLVED', 'ACCOUNT_STATUS_CHANGE', 'EVENT_CREATED', 'SERVICE_VERIFICATION_STATUS_CHANGE', 'ACCOUNT_DELETION_WARNING_30_DAYS', 'ACCOUNT_DELETION_WARNING_15_DAYS', 'ACCOUNT_DELETION_WARNING_5_DAYS', 'ACCOUNT_DELETION_WARNING_1_DAY');
ALTER TABLE "Notification" ALTER COLUMN type TYPE "NotificationType" USING type::text::"NotificationType";
DROP TYPE "NotificationType_old";

-- ==== user trust ====

-- The web build calls user_trust() on every logged-in request, so it ships with the migration
-- instead of waiting for the trigger import. triggers/18_user_trust.sql stays the source for updates.
-- comment_has_accepted_proof mirrors proofStatus in web/src/lib/proofEvidence.ts: evidence counts only
-- through its latest check, and that check has to confirm it.
CREATE OR REPLACE FUNCTION comment_has_accepted_proof(p_comment_id INT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM "CommentEvidence" e
    WHERE e."commentId" = p_comment_id AND e."removedAt" IS NULL
      AND COALESCE((
        SELECT CASE
          WHEN k.finding = 'LEGACY' THEN e."legacyStatus" IS NOT DISTINCT FROM 'APPROVED'
          ELSE k.finding::text IN ('ORDER_FOUND', 'SCREENSHOT_REVIEWED', 'TRANSACTION_SUPPORTED', 'REFUND_SUPPORTED')
        END
        FROM "EvidenceCheck" k WHERE k."evidenceId" = e.id ORDER BY k."recordedAt" DESC, k.id DESC LIMIT 1
      ), false)
  );
$$ LANGUAGE sql STABLE;

-- user_trust returns the facts that unlock features, and the two penalties.
-- A rejection counts under the rule a moderator gave, else the AI's rule, else as spam when the AI
-- called it spam. Rejections with none of these count for nothing. The penalizing rules mirror
-- `penalizes` in web/src/constants/commentRules.ts.
CREATE OR REPLACE FUNCTION user_trust(p_user_ids INT[])
RETURNS TABLE (
  "userId" INT,
  "publishedPosts" INT,
  "checkedProofPosts" INT,
  "approvedSuggestions" INT,
  "penalizingRejections" INT,
  "spamRejections" INT,
  untrusted BOOLEAN,
  "commentsDisabled" BOOLEAN
) AS $$
  WITH posts AS (
    SELECT c."authorId" AS user_id,
      COUNT(*)::INT AS published,
      COUNT(*) FILTER (WHERE comment_has_accepted_proof(c.id))::INT AS with_proof
    FROM "Comment" c
    WHERE c."authorId" = ANY(p_user_ids) AND c.status = 'APPROVED' AND c."parentId" IS NULL
    GROUP BY c."authorId"
  ),
  suggestions AS (
    SELECT s."userId" AS user_id, COUNT(*)::INT AS approved
    FROM "ServiceSuggestion" s
    WHERE s."userId" = ANY(p_user_ids) AND s.status = 'APPROVED'
      AND NOT EXISTS (SELECT 1 FROM "ServiceUser" su WHERE su."userId" = s."userId" AND su."serviceId" = s."serviceId")
    GROUP BY s."userId"
  ),
  rejections AS (
    SELECT c."authorId" AS user_id,
      CASE
        WHEN c."humanDecisionReason" IS NOT NULL THEN c."humanDecisionReason"::TEXT
        WHEN c."aiDecisionReason" IS NOT NULL THEN c."aiDecisionReason"::TEXT
        WHEN c."aiIsSpam" THEN 'SPAM'
      END AS rule,
      CASE WHEN c."humanDecisionReason" IS NOT NULL THEN c."humanDecidedAt" ELSE c."aiDecidedAt" END AS decided_at
    FROM "Comment" c
    WHERE c."authorId" = ANY(p_user_ids) AND c.status = 'REJECTED'
  ),
  recent_rejections AS (
    SELECT user_id,
      COUNT(*) FILTER (WHERE rule IN ('SPAM', 'SCAM_CONTACT', 'HARASSMENT', 'SLUR', 'PRIVATE_INFO', 'NOT_GENUINE'))::INT AS penalizing,
      COUNT(*) FILTER (WHERE rule = 'SPAM')::INT AS spam
    FROM rejections
    WHERE decided_at > NOW() - INTERVAL '90 days'
    GROUP BY user_id
  )
  SELECT u.id,
    COALESCE(p.published, 0),
    COALESCE(p.with_proof, 0),
    COALESCE(s.approved, 0),
    COALESCE(r.penalizing, 0),
    COALESCE(r.spam, 0),
    COALESCE(r.penalizing, 0) >= 2,
    u.spammer OR COALESCE(r.spam, 0) >= 4
  FROM "User" u
  LEFT JOIN posts p ON p.user_id = u.id
  LEFT JOIN suggestions s ON s.user_id = u.id
  LEFT JOIN recent_rejections r ON r.user_id = u.id
  WHERE u.id = ANY(p_user_ids);
$$ LANGUAGE sql STABLE;

-- ==== comment revisions ====

-- Moderators decide edits through apply_comment_revision, so it ships with the migration like
-- user_trust. triggers/19_comment_revisions.sql stays the source for updates.
-- apply_comment_revision decides a pending edit for a moderator (p_decided_by) or the AI (NULL).
-- Approving keeps the live version in history, applies the edit and bumps the version. It never
-- touches the post's own moderation decision: a hold on the post outlives an approved edit. It returns
-- false and decides nothing when the edit is no longer pending, or when an approval would land on a
-- post that changed since the edit was written: a stale edit never overwrites a newer version.
-- experienceData was validated when the edit was submitted; the casts make a malformed record fail
-- instead of writing bad data.
CREATE OR REPLACE FUNCTION apply_comment_revision(
  p_revision_id INT,
  p_approve BOOLEAN,
  p_decided_by INT,
  p_reason TEXT,
  p_rule "CommentRule"
)
RETURNS BOOLEAN AS $$
DECLARE
  v_revision "CommentRevision"%ROWTYPE;
  v_comment "Comment"%ROWTYPE;
  v_data JSONB;
BEGIN
  SELECT * INTO v_revision FROM "CommentRevision" WHERE id = p_revision_id;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  SELECT * INTO v_comment FROM "Comment" WHERE id = v_revision."commentId" FOR UPDATE;
  SELECT * INTO v_revision FROM "CommentRevision" WHERE id = p_revision_id FOR UPDATE;
  IF v_revision.status <> 'PENDING' OR v_revision."redactedAt" IS NOT NULL THEN
    RETURN FALSE;
  END IF;
  IF p_approve AND (v_comment.status <> 'APPROVED' OR v_comment.version <> v_revision."baseVersion") THEN
    RETURN FALSE;
  END IF;

  IF p_approve THEN
    IF NOT EXISTS (
      SELECT 1 FROM "CommentRevision"
      WHERE "commentId" = v_comment.id AND content = v_comment.content AND kind = v_comment.kind
        AND status = 'APPROVED'
    ) THEN
      INSERT INTO "CommentRevision" (
        "commentId", "authorId", "baseVersion", content, kind, "experienceData", status, "createdAt", "decidedAt"
      )
      SELECT v_comment.id, v_comment."authorId", v_comment.version, v_comment.content, v_comment.kind,
        COALESCE(
          (SELECT jsonb_build_object(
             'occurredMonth', e."occurredMonth", 'sentiment', e.sentiment, 'outcome', e.outcome,
             'issues', to_jsonb(v_comment.issues)
           )
           FROM "CommentExperience" e WHERE e."commentId" = v_comment.id),
          '{}'::JSONB
        ),
        'APPROVED', v_comment."createdAt", COALESCE(v_comment."approvedAt", v_comment."createdAt");
    END IF;

    UPDATE "Comment" SET
      content = v_revision.content,
      kind = v_revision.kind,
      version = version + 1,
      "updatedAt" = NOW()
    WHERE id = v_comment.id;

    IF v_revision.kind = 'EXPERIENCE' THEN
      v_data := COALESCE(v_revision."experienceData", '{}'::JSONB);
      INSERT INTO "CommentExperience" ("commentId", "occurredMonth", sentiment, "sentimentSource", outcome)
      VALUES (
        v_comment.id,
        v_data->>'occurredMonth',
        (v_data->>'sentiment')::"ExperienceSentiment",
        CASE WHEN v_data->>'sentiment' IS NOT NULL THEN 'AUTHOR'::"SentimentSource" END,
        COALESCE(v_data->>'outcome', 'UNSPECIFIED')::"ExperienceOutcome"
      )
      ON CONFLICT ("commentId") DO UPDATE SET
        "occurredMonth" = EXCLUDED."occurredMonth",
        sentiment = EXCLUDED.sentiment,
        "sentimentSource" = EXCLUDED."sentimentSource",
        outcome = EXCLUDED.outcome;
      -- Edits written before the problem chips carry no tags and leave the post's tags as they are.
      IF v_data ? 'issues' THEN
        UPDATE "Comment" SET issues = ARRAY(
          SELECT jsonb_array_elements_text(v_data->'issues')
        )::"CommentIssueType"[]
        WHERE id = v_comment.id;
      END IF;
    END IF;
  END IF;

  UPDATE "CommentRevision" SET
    status = CASE WHEN p_approve THEN 'APPROVED'::"CommentStatus" ELSE 'REJECTED'::"CommentStatus" END,
    reason = p_reason,
    "decisionRule" = p_rule,
    "decidedById" = p_decided_by,
    "decidedAt" = NOW()
  WHERE id = p_revision_id;

  -- The author withdrawing their own post also rejects its pending edit; they need no notice of that.
  IF v_comment."authorId" IS NOT NULL AND v_comment."authorId" IS DISTINCT FROM p_decided_by THEN
    INSERT INTO "Notification" ("userId", type, "aboutCommentId")
    VALUES (v_comment."authorId", 'COMMENT_EDIT_REVIEWED', v_comment.id);
  END IF;

  INSERT INTO "AuditLog" ("actorId", action, "targetType", "targetId", summary)
  VALUES (
    p_decided_by, 'UPDATED', 'COMMENT', v_comment.id,
    CONCAT_WS(': ', CASE WHEN p_approve THEN 'Published edit' ELSE 'Rejected edit' END, p_rule::TEXT, p_reason)
  );
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ==== withdrawal and account deletion ====

-- Posts outlive their author's account as placeholders when others replied, so the author link is optional.
ALTER TABLE "Comment" ALTER COLUMN "authorId" DROP NOT NULL;
ALTER TABLE "Comment" DROP CONSTRAINT "Comment_authorId_fkey";
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD COLUMN "statusBeforeWithdrawal" "CommentStatus",
  ADD COLUMN "withdrawnAt" TIMESTAMP(3),
  ADD COLUMN "withdrawnVersion" INTEGER,
  ADD COLUMN "withdrawnWhileWaiting" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "replyTargetDeleted" BOOLEAN NOT NULL DEFAULT false;

-- Account deletion calls delete_user_account, so it ships with the migration like user_trust.
-- triggers/20_account_deletion.sql stays the source for updates.
-- delete_user_account erases an account's posts before the account itself goes.
-- Replies are always deleted; an answer to one is flagged so it doesn't read as a direct reply.
-- A top-level post nobody else replied to is deleted. One others replied to stays as an empty
-- WITHDRAWN placeholder with no author, so their replies keep their thread. Revisions, experience
-- details and proof contents go with the text; proof rows and their check records stay detached.
CREATE OR REPLACE FUNCTION delete_user_account(p_user_id INT)
RETURNS VOID AS $$
DECLARE
  v_placeholders INT[];
BEGIN
  -- Locking the account's posts makes a reply written meanwhile wait, instead of being deleted with its post.
  PERFORM 1 FROM "Comment" WHERE "authorId" = p_user_id FOR UPDATE;
  UPDATE "Comment" SET "replyTargetDeleted" = true
  WHERE "replyToId" IN (SELECT id FROM "Comment" WHERE "authorId" = p_user_id AND "parentId" IS NOT NULL)
    AND "authorId" IS DISTINCT FROM p_user_id;

  DELETE FROM "Comment" WHERE "authorId" = p_user_id AND "parentId" IS NOT NULL;

  v_placeholders := ARRAY(
    SELECT c.id FROM "Comment" c
    WHERE c."authorId" = p_user_id AND c."parentId" IS NULL
      AND EXISTS (SELECT 1 FROM "Comment" r WHERE r."parentId" = c.id)
  );

  UPDATE "CommentEvidence" SET "commentId" = NULL
  WHERE "commentId" = ANY(v_placeholders);
  DELETE FROM "CommentRevision" WHERE "commentId" = ANY(v_placeholders);
  DELETE FROM "CommentExperience" WHERE "commentId" = ANY(v_placeholders);
  UPDATE "Comment" SET
    status = 'WITHDRAWN',
    "statusBeforeWithdrawal" = NULL,
    "withdrawnAt" = COALESCE("withdrawnAt", NOW()),
    "withdrawnVersion" = NULL,
    content = '',
    issues = '{}',
    "authorId" = NULL,
    "updatedAt" = NOW()
  WHERE id = ANY(v_placeholders);

  DELETE FROM "Comment" WHERE "authorId" = p_user_id;
  DELETE FROM "User" WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Proof requests from moderators and service disputes (D14)
CREATE TYPE "ProofRequestSource" AS ENUM ('MODERATOR', 'SERVICE');
CREATE TABLE "ProofRequest" (
    "id" SERIAL NOT NULL,
    "commentId" INTEGER NOT NULL,
    "source" "ProofRequestSource" NOT NULL,
    "requestedById" INTEGER,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    CONSTRAINT "ProofRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProofRequest_commentId_idx" ON "ProofRequest"("commentId");
ALTER TABLE "ProofRequest" ADD CONSTRAINT "ProofRequest_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProofRequest" ADD CONSTRAINT "ProofRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The old AI system wrote its debug line into the internal note; aiReasoning and aiSignals hold the same data.
UPDATE "Comment" SET "adminNote" = NULL WHERE "adminNote" ~ '^AI: (approve|reject|human_review) \(quality=';
