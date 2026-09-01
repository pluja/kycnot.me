-- This script manages user karma based on comment interactions. It handles karma points 
-- for comment approvals, verifications, spam status changes, and votes (upvotes/downvotes).
-- Karma transactions are recorded, and user karma totals are updated accordingly.

-- Drop existing triggers first
DROP TRIGGER IF EXISTS comment_status_change_trigger ON "Comment";
DROP TRIGGER IF EXISTS comment_suspicious_change_trigger ON "Comment";
DROP TRIGGER IF EXISTS comment_rating_mute_change_trigger ON "Comment";
DROP TRIGGER IF EXISTS comment_upvote_change_trigger ON "Comment";
DROP TRIGGER IF EXISTS comment_vote_change_trigger ON "CommentVote";
DROP TRIGGER IF EXISTS set_comment_vote_karma_trigger ON "CommentVote";
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
    vote_action TEXT;
    vote_description TEXT;
    comment_author_id INT;
    service_name TEXT;
    upvote_change INT := 0; -- Variable to track change in upvotes
    voter_id INT;
    karma_delta INT;
BEGIN
    -- Get comment author and service info
    SELECT c."authorId", s.name INTO comment_author_id, service_name
    FROM "Comment" c
    JOIN "Service" s ON c.id = COALESCE(NEW."commentId", OLD."commentId") AND c."serviceId" = s.id;

    IF TG_OP = 'INSERT' THEN
        vote_action := CASE WHEN NEW.downvote THEN 'COMMENT_DOWNVOTE' ELSE 'COMMENT_UPVOTE' END;
        vote_description := format('Your comment #comment-%s in %s received %s', 
            NEW."commentId", 
            service_name,
            CASE WHEN NEW.downvote THEN 'a downvote' ELSE 'an upvote' END);
        upvote_change := CASE WHEN NEW.downvote THEN -1 ELSE 1 END; -- -1 for downvote, +1 for upvote
    ELSIF TG_OP = 'DELETE' THEN
        vote_action := 'COMMENT_VOTE_REMOVED';
        vote_description := format('A vote was removed from your comment #comment-%s in %s', 
            OLD."commentId",
            service_name);
        upvote_change := CASE WHEN OLD.downvote THEN 1 ELSE -1 END; -- +1 if downvote removed, -1 if upvote removed
    ELSIF TG_OP = 'UPDATE' THEN
        vote_action := CASE WHEN NEW.downvote THEN 'COMMENT_DOWNVOTE' ELSE 'COMMENT_UPVOTE' END;
        vote_description := format('Your comment #comment-%s in %s vote changed to %s', 
            NEW."commentId",
            service_name,
            CASE WHEN NEW.downvote THEN 'downvote' ELSE 'upvote' END);
        -- Only a real flip moves the score. Two requests can both read the same
        -- vote and both take the update branch; the second then runs against
        -- the row the first already flipped, leaving the direction unchanged.
        -- Counted as a flip anyway, that no-op is worth another two points, and
        -- can be repeated.
        upvote_change := CASE
            WHEN OLD.downvote IS NOT DISTINCT FROM NEW.downvote THEN 0
            WHEN NEW.downvote THEN -2
            ELSE 2
        END;
    END IF;

    voter_id := COALESCE(NEW."userId", OLD."userId");

    -- What the vote is worth now, less what it was already paid. set_comment_vote_karma
    -- decided both, so a vote hands back exactly what it gave however it is
    -- flipped or removed, and no karma survives its own vote.
    karma_delta := COALESCE(NEW."karmaApplied", 0) - COALESCE(OLD."karmaApplied", 0);

    IF karma_delta <> 0 THEN
        PERFORM insert_karma_transaction(
            comment_author_id,
            karma_delta,
            vote_action,
            COALESCE(NEW."commentId", OLD."commentId"),
            vote_description
        );

        PERFORM update_user_karma(comment_author_id, karma_delta);
    END IF;

    -- Skipped for a self-vote, or the score an account cannot pay itself karma
    -- for would still be one it can raise at will.
    IF voter_id IS DISTINCT FROM comment_author_id THEN
        UPDATE "Comment"
        SET upvotes = upvotes + upvote_change
        WHERE id = COALESCE(NEW."commentId", OLD."commentId");
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Decides what a vote is worth to its author, once, and stores it on the vote.
-- The cap has to be read off the vote rather than recomputed when it is removed:
-- a count of live rows changes between the two moments, so a vote could be paid
-- under the cap and refunded over it, or refunded when it had never been paid.
-- Either way a pair of accounts moved karma without limit, which is what the cap
-- exists to stop.
CREATE OR REPLACE FUNCTION set_comment_vote_karma()
RETURNS TRIGGER AS $$
DECLARE
    comment_author_id INT;
    is_author_admin_or_moderator BOOLEAN;
    paid_votes_from_voter INT;
    -- How much karma one account can move for another, in either direction.
    -- Reddit and HN both refuse to pay karma one-for-one per vote; without a
    -- ceiling a handful of accounts can set anyone's karma to anything.
    max_karma_votes_per_pair CONSTANT INT := 3;
BEGIN
    SELECT "authorId" INTO comment_author_id
    FROM "Comment" WHERE id = NEW."commentId";

    SELECT (admin = true OR 'comments:moderate' = ANY(capabilities))
    INTO is_author_admin_or_moderator
    FROM "User" WHERE id = comment_author_id;

    -- One voter and one author at a time. The count below decides whether this
    -- vote is paid, and votes cast at the same moment on different comments
    -- would each read it before any of them was written, so every one of them
    -- would be paid and the cap would hold only against a reader who waits.
    -- Keyed on the pair, so two voters on the same author take different locks,
    -- though they still meet on that author's row when the karma is written.
    -- The lock ends with the transaction.
    PERFORM pg_advisory_xact_lock(NEW."userId", comment_author_id);

    -- Votes this account has already been paid for on this author's comments,
    -- this one excluded. Counted per pair rather than per comment, so spreading
    -- the votes over more comments does not buy more karma.
    SELECT count(*) INTO paid_votes_from_voter
    FROM "CommentVote" v
    JOIN "Comment" c ON c.id = v."commentId"
    WHERE v."userId" = NEW."userId"
      AND c."authorId" = comment_author_id
      AND v."karmaApplied" <> 0
      AND v.id IS DISTINCT FROM NEW.id;

    -- The vote still counts on the comment. Only the karma stops, and nothing
    -- tells the voter, so an account farming karma cannot tell a capped vote
    -- from one that worked.
    IF COALESCE(is_author_admin_or_moderator, false)
       OR NEW."userId" IS NOT DISTINCT FROM comment_author_id
       OR paid_votes_from_voter >= max_karma_votes_per_pair
    THEN
        NEW."karmaApplied" := 0;
    ELSE
        NEW."karmaApplied" := CASE WHEN NEW.downvote THEN -1 ELSE 1 END;
    END IF;

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

CREATE TRIGGER set_comment_vote_karma_trigger
    BEFORE INSERT OR UPDATE
    ON "CommentVote"
    FOR EACH ROW
    EXECUTE FUNCTION set_comment_vote_karma();

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
