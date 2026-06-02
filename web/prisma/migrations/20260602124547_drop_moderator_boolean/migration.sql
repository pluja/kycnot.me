-- Decompose the legacy `moderator` boolean into capabilities.
--   1. Grant existing moderators their equivalent capabilities (read before drop).
--   2. Recreate the rating-trust + status-notification triggers so they key off
--      `capabilities` instead of `moderator`, removing the column dependency that
--      would otherwise block the DROP.
--   3. Drop the column.

UPDATE "User"
SET "capabilities" = "capabilities" || ARRAY['comments:moderate', 'contact:manage']::text[]
WHERE "moderator" = true
  AND NOT ("capabilities" @> ARRAY['comments:moderate']::text[]);

DROP TRIGGER IF EXISTS comment_rating_trust_before_write_trigger ON "Comment";
DROP TRIGGER IF EXISTS comment_average_rating_trigger ON "Comment";
DROP TRIGGER IF EXISTS user_rating_trust_trigger ON "User";
DROP TRIGGER IF EXISTS service_user_rating_trust_trigger ON "ServiceUser";

-- Drop any prior signature (the function name is unique in our usage).
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT oid::regprocedure::text AS sig FROM pg_proc WHERE proname = 'calculate_comment_rating_trust'
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig;
    END LOOP;
END
$$;
DROP FUNCTION IF EXISTS set_comment_rating_trust_before_write();
DROP FUNCTION IF EXISTS recalculate_service_user_rating(INT);
DROP FUNCTION IF EXISTS calculate_average_rating();
DROP FUNCTION IF EXISTS refresh_user_comment_rating_trust();
DROP FUNCTION IF EXISTS refresh_service_user_comment_rating_trust();

CREATE OR REPLACE FUNCTION calculate_comment_rating_trust(
    p_rating INT,
    p_rating_active BOOLEAN,
    p_rating_muted BOOLEAN,
    p_rating_mute_reason "RatingMuteReason",
    p_parent_id INT,
    p_status "CommentStatus",
    p_private_proof_status "PrivateProofStatus",
    p_author_id INT,
    p_service_id INT
)
RETURNS TABLE(weight DOUBLE PRECISION, label TEXT, reason TEXT) AS $$
DECLARE
    author_record RECORD;
    is_service_affiliated BOOLEAN;
BEGIN
    IF p_rating IS NULL OR p_parent_id IS NOT NULL THEN
        RETURN QUERY SELECT 0::DOUBLE PRECISION, 'Not counted'::TEXT, 'No active root rating'::TEXT;
        RETURN;
    END IF;

    IF p_rating_muted IS TRUE THEN
        RETURN QUERY SELECT
            0::DOUBLE PRECISION,
            'Not counted'::TEXT,
            CASE p_rating_mute_reason
                WHEN 'AUTHOR_AFFILIATED'    THEN 'Author is affiliated with the service'
                WHEN 'AUTHOR_LOW_TRUST'     THEN 'Author has low trust'
                WHEN 'SUSPICIOUS_PATTERN'   THEN 'Marked as suspicious'
                WHEN 'TEMPLATE_SPAM'        THEN 'Template spam pattern'
                WHEN 'CONFLICT_OF_INTEREST' THEN 'Conflict of interest'
                WHEN 'MODERATOR_DISCRETION' THEN 'Rating was disabled by a moderator'
                ELSE 'Rating muted'
            END;
        RETURN;
    END IF;

    IF p_status NOT IN ('APPROVED'::"CommentStatus", 'VERIFIED'::"CommentStatus") THEN
        RETURN QUERY SELECT 0::DOUBLE PRECISION, 'Not counted'::TEXT, 'Comment is not approved'::TEXT;
        RETURN;
    END IF;

    IF p_rating_active IS NOT TRUE THEN
        RETURN QUERY SELECT 0::DOUBLE PRECISION, 'Not counted'::TEXT, 'Older rating replaced by a newer review'::TEXT;
        RETURN;
    END IF;

    SELECT u."totalKarma", u.spammer, u.admin, ('comments:moderate' = ANY(u.capabilities)) AS is_moderator, u.verified
    INTO author_record
    FROM "User" u
    WHERE u.id = p_author_id;

    IF author_record IS NULL THEN
        RETURN QUERY SELECT 0::DOUBLE PRECISION, 'Not counted'::TEXT, 'Author account was not found'::TEXT;
        RETURN;
    END IF;

    IF author_record.spammer IS TRUE OR author_record."totalKarma" <= -5 THEN
        RETURN QUERY SELECT 0::DOUBLE PRECISION, 'Not counted'::TEXT, 'Author account is untrusted'::TEXT;
        RETURN;
    END IF;

    SELECT EXISTS(
        SELECT 1
        FROM "ServiceUser" su
        WHERE su."userId" = p_author_id AND su."serviceId" = p_service_id
    ) INTO is_service_affiliated;

    IF is_service_affiliated IS TRUE THEN
        RETURN QUERY SELECT 0::DOUBLE PRECISION, 'Not counted'::TEXT, 'Author is affiliated with this service'::TEXT;
        RETURN;
    END IF;

    IF p_status = 'VERIFIED'::"CommentStatus" THEN
        RETURN QUERY SELECT 1::DOUBLE PRECISION, 'Verified review'::TEXT, 'Review was verified by KYCnot.me'::TEXT;
        RETURN;
    END IF;

    IF p_private_proof_status = 'APPROVED'::"PrivateProofStatus" THEN
        RETURN QUERY SELECT 0.9::DOUBLE PRECISION, 'Verified customer'::TEXT, 'Private proof was approved'::TEXT;
        RETURN;
    END IF;

    -- keep karma-based weights in sync with reviewWeight unlocks in src/constants/karmaUnlocks.ts.
    -- changing thresholds also requires updating refresh_user_comment_rating_trust() below and the drift test.
    IF author_record.admin IS TRUE OR author_record.is_moderator IS TRUE THEN
        RETURN QUERY SELECT 0.9::DOUBLE PRECISION, 'Trusted user'::TEXT, 'Author is a KYCnot.me admin or moderator'::TEXT;
        RETURN;
    END IF;

    IF author_record.verified IS TRUE THEN
        RETURN QUERY SELECT 0.8::DOUBLE PRECISION, 'Trusted user'::TEXT, 'Author account is verified'::TEXT;
        RETURN;
    END IF;

    IF author_record."totalKarma" >= 150 THEN
        RETURN QUERY SELECT 0.8::DOUBLE PRECISION, 'Trusted user'::TEXT, 'Author has high karma'::TEXT;
        RETURN;
    END IF;

    IF author_record."totalKarma" >= 25 THEN
        RETURN QUERY SELECT 0.45::DOUBLE PRECISION, 'Active user'::TEXT, 'Author has account activity'::TEXT;
        RETURN;
    END IF;

    IF author_record."totalKarma" >= 5 THEN
        RETURN QUERY SELECT 0.2::DOUBLE PRECISION, NULL::TEXT, 'Author has some account activity'::TEXT;
        RETURN;
    END IF;

    RETURN QUERY SELECT 0.1::DOUBLE PRECISION, NULL::TEXT, 'Author has little account activity'::TEXT;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_comment_rating_trust_before_write()
RETURNS TRIGGER AS $$
BEGIN
    SELECT t.weight, t.label, t.reason
    INTO NEW."ratingWeight", NEW."ratingTrustLabel", NEW."ratingTrustReason"
    FROM calculate_comment_rating_trust(
        NEW.rating,
        NEW."ratingActive",
        NEW."ratingMuted",
        NEW."ratingMuteReason",
        NEW."parentId",
        NEW.status,
        NEW."privateProofStatus",
        NEW."authorId",
        NEW."serviceId"
    ) AS t;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION recalculate_service_user_rating(p_service_id INT)
RETURNS VOID AS $$
DECLARE
    average_user_rating DOUBLE PRECISION;
    trust_weighted_user_rating DOUBLE PRECISION;
    user_rating_count INT;
    trusted_user_rating_count INT;
    user_rating_weight DOUBLE PRECISION;
BEGIN
    SELECT
        AVG(c.rating)::DOUBLE PRECISION,
        COUNT(*)::INT,
        COUNT(*) FILTER (WHERE c."ratingWeight" >= 0.45)::INT,
        COALESCE(SUM(c."ratingWeight"), 0)::DOUBLE PRECISION,
        CASE
            WHEN COALESCE(SUM(c."ratingWeight"), 0) >= 0.45 THEN
                (SUM((c.rating::DOUBLE PRECISION) * c."ratingWeight") / SUM(c."ratingWeight"))::DOUBLE PRECISION
            ELSE NULL
        END
    INTO average_user_rating, user_rating_count, trusted_user_rating_count, user_rating_weight, trust_weighted_user_rating
    FROM "Comment" c
    WHERE c."serviceId" = p_service_id
    AND c."parentId" IS NULL
    AND c.rating IS NOT NULL
    AND (c.status = 'APPROVED'::"CommentStatus" OR c.status = 'VERIFIED'::"CommentStatus")
    AND c."ratingActive" = true
    AND c."ratingMuted" = false;

    UPDATE "Service"
    SET
        "averageUserRating" = average_user_rating,
        "trustWeightedUserRating" = trust_weighted_user_rating,
        "userRatingCount" = COALESCE(user_rating_count, 0),
        "trustedUserRatingCount" = COALESCE(trusted_user_rating_count, 0),
        "userRatingWeight" = COALESCE(user_rating_weight, 0)
    WHERE "id" = p_service_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calculate_average_rating()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM recalculate_service_user_rating(OLD."serviceId");
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD."serviceId" <> NEW."serviceId" THEN
        PERFORM recalculate_service_user_rating(OLD."serviceId");
    END IF;

    PERFORM recalculate_service_user_rating(NEW."serviceId");
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION refresh_user_comment_rating_trust()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.spammer = NEW.spammer
    AND OLD.verified = NEW.verified
    AND OLD.admin = NEW.admin
    AND OLD.capabilities = NEW.capabilities
    AND (
        CASE
            WHEN OLD."totalKarma" <= -5 THEN -1
            WHEN OLD."totalKarma" < 5 THEN 0
            WHEN OLD."totalKarma" < 25 THEN 1
            WHEN OLD."totalKarma" < 150 THEN 2
            ELSE 3
        END
    ) = (
        CASE
            WHEN NEW."totalKarma" <= -5 THEN -1
            WHEN NEW."totalKarma" < 5 THEN 0
            WHEN NEW."totalKarma" < 25 THEN 1
            WHEN NEW."totalKarma" < 150 THEN 2
            ELSE 3
        END
    ) THEN
        RETURN NEW;
    END IF;

    UPDATE "Comment"
    SET "ratingWeight" = "ratingWeight"
    WHERE "authorId" = NEW.id AND rating IS NOT NULL;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION refresh_service_user_comment_rating_trust()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        UPDATE "Comment"
        SET "ratingWeight" = "ratingWeight"
        WHERE "authorId" = OLD."userId" AND "serviceId" = OLD."serviceId" AND rating IS NOT NULL;

        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' AND (OLD."userId" <> NEW."userId" OR OLD."serviceId" <> NEW."serviceId") THEN
        UPDATE "Comment"
        SET "ratingWeight" = "ratingWeight"
        WHERE "authorId" = OLD."userId" AND "serviceId" = OLD."serviceId" AND rating IS NOT NULL;
    END IF;

    UPDATE "Comment"
    SET "ratingWeight" = "ratingWeight"
    WHERE "authorId" = NEW."userId" AND "serviceId" = NEW."serviceId" AND rating IS NOT NULL;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER comment_rating_trust_before_write_trigger
    BEFORE INSERT OR UPDATE
    ON "Comment"
    FOR EACH ROW
    EXECUTE FUNCTION set_comment_rating_trust_before_write();

CREATE TRIGGER comment_average_rating_trigger
    AFTER INSERT OR DELETE OR UPDATE OF rating, "ratingActive", "ratingMuted", "ratingMuteReason", status, "parentId", "serviceId", "authorId", "privateProofStatus", "ratingWeight"
    ON "Comment"
    FOR EACH ROW
    EXECUTE FUNCTION calculate_average_rating();

CREATE TRIGGER user_rating_trust_trigger
    AFTER UPDATE OF "totalKarma", spammer, verified, admin, capabilities
    ON "User"
    FOR EACH ROW
    WHEN (
        OLD."totalKarma" <> NEW."totalKarma"
        OR OLD.spammer <> NEW.spammer
        OR OLD.verified <> NEW.verified
        OR OLD.admin <> NEW.admin
        OR OLD.capabilities <> NEW.capabilities
    )
    EXECUTE FUNCTION refresh_user_comment_rating_trust();

CREATE TRIGGER service_user_rating_trust_trigger
    AFTER INSERT OR UPDATE OR DELETE
    ON "ServiceUser"
    FOR EACH ROW
    EXECUTE FUNCTION refresh_service_user_comment_rating_trust();

UPDATE "Comment"
SET "ratingWeight" = "ratingWeight"
WHERE rating IS NOT NULL;

SELECT recalculate_service_user_rating(id)
FROM "Service";


CREATE OR REPLACE FUNCTION trigger_user_status_change_notifications()
RETURNS TRIGGER AS $$
DECLARE
  status_change "AccountStatusChange";
BEGIN
  -- Check for admin status change
  IF OLD.admin IS DISTINCT FROM NEW.admin THEN
    IF NEW.admin = true THEN
      status_change := 'ADMIN_TRUE';
    ELSE
      status_change := 'ADMIN_FALSE';
    END IF;
    INSERT INTO "Notification" ("userId", "type", "aboutAccountStatusChange")
    VALUES (NEW.id, 'ACCOUNT_STATUS_CHANGE', status_change);
  END IF;

  -- Check for verified status change
  IF OLD.verified IS DISTINCT FROM NEW.verified THEN
    IF NEW.verified = true THEN
      status_change := 'VERIFIED_TRUE';
    ELSE
      status_change := 'VERIFIED_FALSE';
    END IF;
    INSERT INTO "Notification" ("userId", "type", "aboutAccountStatusChange")
    VALUES (NEW.id, 'ACCOUNT_STATUS_CHANGE', status_change);
  END IF;

  -- Check for comment-moderation capability change (the legacy "moderator" role).
  IF ('comments:moderate' = ANY(OLD.capabilities)) IS DISTINCT FROM ('comments:moderate' = ANY(NEW.capabilities)) THEN
    IF 'comments:moderate' = ANY(NEW.capabilities) THEN
      status_change := 'MODERATOR_TRUE';
    ELSE
      status_change := 'MODERATOR_FALSE';
    END IF;
    INSERT INTO "Notification" ("userId", "type", "aboutAccountStatusChange")
    VALUES (NEW.id, 'ACCOUNT_STATUS_CHANGE', status_change);
  END IF;

  -- Check for spammer status change
  IF OLD.spammer IS DISTINCT FROM NEW.spammer THEN
    IF NEW.spammer = true THEN
      status_change := 'SPAMMER_TRUE';
    ELSE
      status_change := 'SPAMMER_FALSE';
    END IF;
    INSERT INTO "Notification" ("userId", "type", "aboutAccountStatusChange")
    VALUES (NEW.id, 'ACCOUNT_STATUS_CHANGE', status_change);
  END IF;

  -- Return NULL for AFTER triggers as the return value is ignored.
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Drop the trigger if it exists to ensure a clean setup
DROP TRIGGER IF EXISTS user_status_change_notifications_trigger ON "User";

-- Create the trigger to fire after updates on specific status columns
CREATE TRIGGER user_status_change_notifications_trigger
  AFTER UPDATE OF admin, verified, capabilities, spammer ON "User"
  FOR EACH ROW
  EXECUTE FUNCTION trigger_user_status_change_notifications();

-- AlterTable
ALTER TABLE "User" DROP COLUMN "moderator";
