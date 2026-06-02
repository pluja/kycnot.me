-- Decompose the legacy `moderator` boolean into capabilities.
--   1. Grant existing moderators their equivalent capabilities (read before drop).
--   2. Recreate every trigger function that referenced the column so it keys off
--      the capabilities array instead. Triggers 03/10 also list `moderator` in
--      their UPDATE OF clause, a hard dependency that would otherwise block the
--      DROP; the karma triggers (01) only read it in their bodies.
--   3. Drop the column.

UPDATE "User"
SET "capabilities" = "capabilities" || ARRAY['comments:moderate', 'contact:manage']::text[]
WHERE "moderator" = true
  AND NOT ("capabilities" @> ARRAY['comments:moderate']::text[]);

-- This script manages user karma based on comment interactions. It handles karma points 
-- for comment approvals, verifications, spam status changes, and votes (upvotes/downvotes).
-- Karma transactions are recorded, and user karma totals are updated accordingly.

-- Drop existing triggers first
DROP TRIGGER IF EXISTS comment_status_change_trigger ON "Comment";
DROP TRIGGER IF EXISTS comment_suspicious_change_trigger ON "Comment";
DROP TRIGGER IF EXISTS comment_rating_mute_change_trigger ON "Comment";
DROP TRIGGER IF EXISTS comment_upvote_change_trigger ON "Comment";
DROP TRIGGER IF EXISTS comment_vote_change_trigger ON "CommentVote";
DROP TRIGGER IF EXISTS suggestion_status_change_trigger ON "ServiceSuggestion";
DROP TRIGGER IF EXISTS manual_karma_adjustment_trigger ON "KarmaTransaction";

-- Drop existing functions
DROP FUNCTION IF EXISTS handle_comment_upvote_change();
DROP FUNCTION IF EXISTS handle_comment_status_change();
DROP FUNCTION IF EXISTS handle_comment_approval();
DROP FUNCTION IF EXISTS handle_comment_verification();
DROP FUNCTION IF EXISTS handle_comment_spam_status();
DROP FUNCTION IF EXISTS handle_rating_mute_change();
DROP FUNCTION IF EXISTS handle_comment_vote_change();
DROP FUNCTION IF EXISTS insert_karma_transaction();
DROP FUNCTION IF EXISTS update_user_karma();
DROP FUNCTION IF EXISTS handle_suggestion_status_change();
DROP FUNCTION IF EXISTS handle_manual_karma_adjustment();

-- Helper function to insert karma transaction
CREATE OR REPLACE FUNCTION insert_karma_transaction(
    p_user_id INT,
    p_points INT,
    p_action TEXT,
    p_comment_id INT,
    p_description TEXT,
    p_suggestion_id INT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    INSERT INTO "KarmaTransaction" (
        "userId", "points", "action", "commentId", "suggestionId", "description", "processed", "createdAt"
    )
    VALUES (
        p_user_id,
        p_points,
        p_action::"KarmaTransactionAction",
        p_comment_id,
        p_suggestion_id,
        p_description,
        true,
        NOW()
    );
END;
$$ LANGUAGE plpgsql;

-- Helper function to update user karma
CREATE OR REPLACE FUNCTION update_user_karma(
    p_user_id INT,
    p_karma_change INT
) RETURNS VOID AS $$
BEGIN
    UPDATE "User"
    SET "totalKarma" = "totalKarma" + p_karma_change
    WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Handle comment approval
CREATE OR REPLACE FUNCTION handle_comment_approval(
    NEW RECORD,
    OLD RECORD
) RETURNS VOID AS $$
DECLARE
    is_user_related_to_service BOOLEAN;
    is_user_admin_or_moderator BOOLEAN;
BEGIN
    IF NEW.status = 'APPROVED'
        AND OLD.status IS DISTINCT FROM 'APPROVED'
        AND OLD.status IS DISTINCT FROM 'VERIFIED'
        AND NOT EXISTS (
            SELECT 1
            FROM "KarmaTransaction" kt
            WHERE kt."commentId" = NEW.id
            AND kt.action = 'COMMENT_APPROVED'
        )
    THEN
        -- Check if the user is related to the service (e.g., owns/manages it)
        SELECT EXISTS(
            SELECT 1 FROM "ServiceUser" 
            WHERE "userId" = NEW."authorId" AND "serviceId" = NEW."serviceId"
        ) INTO is_user_related_to_service;
        
        -- Check if the user is an admin or moderator
        SELECT (admin = true OR 'comments:moderate' = ANY(capabilities))
        FROM "User"
        WHERE id = NEW."authorId"
        INTO is_user_admin_or_moderator;
        
        -- Only award karma if the user is NOT related to the service AND is NOT an admin/moderator
        IF NOT is_user_related_to_service AND NOT COALESCE(is_user_admin_or_moderator, false) THEN
            PERFORM insert_karma_transaction(
                NEW."authorId",
                1,
                'COMMENT_APPROVED',
                NEW.id,
                format('Your comment #comment-%s in %s has been approved!', 
                    NEW.id, 
                    (SELECT name FROM "Service" WHERE id = NEW."serviceId"))
            );
            PERFORM update_user_karma(NEW."authorId", 1);
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Handle comment verification
CREATE OR REPLACE FUNCTION handle_comment_verification(
    NEW RECORD,
    OLD RECORD
) RETURNS VOID AS $$
DECLARE
    is_user_admin_or_moderator BOOLEAN;
BEGIN
    IF NEW.status = 'VERIFIED' AND OLD.status != 'VERIFIED' THEN
        -- Check if the comment author is an admin or moderator
        SELECT (admin = true OR 'comments:moderate' = ANY(capabilities))
        FROM "User"
        WHERE id = NEW."authorId"
        INTO is_user_admin_or_moderator;

        -- Only award karma if the user is NOT an admin/moderator
        IF NOT COALESCE(is_user_admin_or_moderator, false) THEN
            PERFORM insert_karma_transaction(
                NEW."authorId",
                5,
                'COMMENT_VERIFIED',
                NEW.id,
                format('Your comment #comment-%s in %s has been verified!', 
                    NEW.id, 
                    (SELECT name FROM "Service" WHERE id = NEW."serviceId"))
            );
            PERFORM update_user_karma(NEW."authorId", 5);
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Handle rating-mute changes that constitute spam (penalty-bearing reasons).
-- Karma fires only for SUSPICIOUS_PATTERN and TEMPLATE_SPAM. Affiliation, conflict
-- of interest, or moderator discretion do not penalize the author.
CREATE OR REPLACE FUNCTION handle_rating_mute_change(
    NEW RECORD,
    OLD RECORD
) RETURNS VOID AS $$
DECLARE
    was_penalty BOOLEAN;
    is_penalty  BOOLEAN;
BEGIN
    was_penalty := COALESCE(OLD."ratingMuted", false)
                   AND OLD."ratingMuteReason"::text IN ('SUSPICIOUS_PATTERN', 'TEMPLATE_SPAM');
    is_penalty  := COALESCE(NEW."ratingMuted", false)
                   AND NEW."ratingMuteReason"::text IN ('SUSPICIOUS_PATTERN', 'TEMPLATE_SPAM');

    IF NOT was_penalty AND is_penalty THEN
        PERFORM insert_karma_transaction(
            NEW."authorId",
            -10,
            'COMMENT_SPAM',
            NEW.id,
            format('Your comment #comment-%s in %s has been marked as spam.',
                NEW.id,
                (SELECT name FROM "Service" WHERE id = NEW."serviceId"))
        );
        PERFORM update_user_karma(NEW."authorId", -10);
    ELSIF was_penalty AND NOT is_penalty THEN
        PERFORM insert_karma_transaction(
            NEW."authorId",
            10,
            'COMMENT_SPAM_REVERTED',
            NEW.id,
            format('Your comment #comment-%s in %s is no longer marked as spam.',
                NEW.id,
                (SELECT name FROM "Service" WHERE id = NEW."serviceId"))
        );
        PERFORM update_user_karma(NEW."authorId", 10);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function for handling vote changes
CREATE OR REPLACE FUNCTION handle_comment_vote_change()
RETURNS TRIGGER AS $$
DECLARE
    karma_points INT;
    vote_action "KarmaTransactionAction";
    vote_description TEXT;
    comment_author_id INT;
    service_name TEXT;
    upvote_change INT := 0; -- Variable to track change in upvotes
    is_author_admin_or_moderator BOOLEAN;
BEGIN
    -- Get comment author and service info
    SELECT c."authorId", s.name INTO comment_author_id, service_name
    FROM "Comment" c
    JOIN "Service" s ON c.id = COALESCE(NEW."commentId", OLD."commentId") AND c."serviceId" = s.id;

    -- Check if the comment author is an admin or moderator
    SELECT (admin = true OR 'comments:moderate' = ANY(capabilities))
    FROM "User"
    WHERE id = comment_author_id
    INTO is_author_admin_or_moderator;

    -- Calculate karma impact based on vote type
    IF TG_OP = 'INSERT' THEN
        -- New vote
        karma_points := CASE WHEN NEW.downvote THEN -1 ELSE 1 END;
        vote_action := CASE WHEN NEW.downvote THEN 'COMMENT_DOWNVOTE' ELSE 'COMMENT_UPVOTE' END;
        vote_description := format('Your comment #comment-%s in %s received %s', 
            NEW."commentId", 
            service_name,
            CASE WHEN NEW.downvote THEN 'a downvote' ELSE 'an upvote' END);
        upvote_change := CASE WHEN NEW.downvote THEN -1 ELSE 1 END; -- -1 for downvote, +1 for upvote
    ELSIF TG_OP = 'DELETE' THEN
        -- Removed vote
        karma_points := CASE WHEN OLD.downvote THEN 1 ELSE -1 END;
        vote_action := 'COMMENT_VOTE_REMOVED';
        vote_description := format('A vote was removed from your comment #comment-%s in %s', 
            OLD."commentId",
            service_name);
        upvote_change := CASE WHEN OLD.downvote THEN 1 ELSE -1 END; -- +1 if downvote removed, -1 if upvote removed
    ELSIF TG_OP = 'UPDATE' THEN
        -- Changed vote (from upvote to downvote or vice versa)
        karma_points := CASE WHEN NEW.downvote THEN -2 ELSE 2 END;
        vote_action := CASE WHEN NEW.downvote THEN 'COMMENT_DOWNVOTE' ELSE 'COMMENT_UPVOTE' END;
        vote_description := format('Your comment #comment-%s in %s vote changed to %s', 
            NEW."commentId",
            service_name,
            CASE WHEN NEW.downvote THEN 'downvote' ELSE 'upvote' END);
        upvote_change := CASE WHEN NEW.downvote THEN -2 ELSE 2 END; -- -2 if upvote->downvote, +2 if downvote->upvote
    END IF;

    -- Only award karma if the author is NOT an admin/moderator
    IF NOT COALESCE(is_author_admin_or_moderator, false) THEN
        -- Record karma transaction and update user karma
        PERFORM insert_karma_transaction(
            comment_author_id,
            karma_points,
            vote_action,
            COALESCE(NEW."commentId", OLD."commentId"),
            vote_description
        );
        
        PERFORM update_user_karma(comment_author_id, karma_points);
    END IF;
    
    -- Update comment's upvotes count incrementally
    UPDATE "Comment"
    SET upvotes = upvotes + upvote_change
    WHERE id = COALESCE(NEW."commentId", OLD."commentId");

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Main function for handling status changes
CREATE OR REPLACE FUNCTION handle_comment_status_change()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM handle_comment_approval(NEW, OLD);
    PERFORM handle_comment_verification(NEW, OLD);
    PERFORM handle_rating_mute_change(NEW, OLD);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE TRIGGER comment_status_change_trigger
    AFTER UPDATE OF status
    ON "Comment"
    FOR EACH ROW
    EXECUTE FUNCTION handle_comment_status_change();

CREATE TRIGGER comment_rating_mute_change_trigger
    AFTER UPDATE OF "ratingMuted", "ratingMuteReason"
    ON "Comment"
    FOR EACH ROW
    EXECUTE FUNCTION handle_comment_status_change();

CREATE TRIGGER comment_vote_change_trigger
    AFTER INSERT OR UPDATE OR DELETE
    ON "CommentVote"
    FOR EACH ROW
    EXECUTE FUNCTION handle_comment_vote_change();

-- Function to handle suggestion status changes and award karma
CREATE OR REPLACE FUNCTION handle_suggestion_status_change()
RETURNS TRIGGER AS $$
DECLARE
    service_name TEXT;
    service_visibility "ServiceVisibility";
    is_user_admin_or_moderator BOOLEAN;
BEGIN
    -- Award karma for first approval
    -- Check that OLD.status is not NULL to handle the initial creation case if needed,
    -- and ensure it wasn't already APPROVED.
    IF OLD.status IS DISTINCT FROM 'APPROVED' AND NEW.status = 'APPROVED' THEN
        -- Fetch service details for the description
        SELECT name, "serviceVisibility" INTO service_name, service_visibility FROM "Service" WHERE id = NEW."serviceId";
        
        -- Only award karma if the service is public
        IF service_visibility = 'PUBLIC' THEN
            -- Check if the user is an admin or moderator
            SELECT (admin = true OR 'comments:moderate' = ANY(capabilities))
            FROM "User"
            WHERE id = NEW."userId"
            INTO is_user_admin_or_moderator;
            
            -- Only award karma if the user is NOT an admin/moderator
            IF NOT COALESCE(is_user_admin_or_moderator, false) THEN
                -- Insert karma transaction, linking it to the suggestion
                PERFORM insert_karma_transaction(
                    NEW."userId",
                    10,
                    'SUGGESTION_APPROVED',
                    NULL, -- p_comment_id (not applicable)
                    format('Your suggestion for service ''%s'' has been approved!', service_name),
                    NEW.id -- p_suggestion_id
                );

                -- Update user's total karma
                PERFORM update_user_karma(NEW."userId", 10);
            END IF;
        END IF;
    END IF;

    RETURN NEW; -- Result is ignored since this is an AFTER trigger
END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE TRIGGER suggestion_status_change_trigger
    AFTER UPDATE OF status
    ON "ServiceSuggestion"
    FOR EACH ROW
    EXECUTE FUNCTION handle_suggestion_status_change();

-- Function to handle manual karma adjustments
CREATE OR REPLACE FUNCTION handle_manual_karma_adjustment()
RETURNS TRIGGER AS $$
BEGIN
    -- Only process MANUAL_ADJUSTMENT transactions that are not yet processed
    IF NEW.processed = false AND NEW.action = 'MANUAL_ADJUSTMENT' THEN
        -- Update user's total karma
        PERFORM update_user_karma(NEW."userId", NEW.points);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for manual karma adjustments
CREATE TRIGGER manual_karma_adjustment_trigger
    AFTER INSERT
    ON "KarmaTransaction"
    FOR EACH ROW
    EXECUTE FUNCTION handle_manual_karma_adjustment();


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
