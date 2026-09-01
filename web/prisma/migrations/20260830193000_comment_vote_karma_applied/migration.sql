ALTER TABLE "CommentVote" ADD COLUMN     "karmaApplied" INTEGER NOT NULL DEFAULT 0;

-- Backfill what the old trigger actually granted: one point per vote, in the
-- vote's direction, except on comments by an admin or moderator, which never
-- paid. Without this every existing vote reads as unpaid and removing it would
-- keep karma it did grant.
--
-- This reads staff status as it is now, while the old trigger read it as it was
-- when the vote was cast, and nothing records the status of that moment. An
-- author demoted since would have paid votes recorded as unpaid, which can then
-- never be handed back. Checked before writing this, against the recorded
-- status changes:
--
--   SELECT n."aboutAccountStatusChange", count(DISTINCT n."userId"),
--          count(*) FILTER (WHERE EXISTS (
--            SELECT 1 FROM "CommentVote" v JOIN "Comment" c ON c.id = v."commentId"
--            WHERE c."authorId" = n."userId" AND v."createdAt" < n."createdAt"))
--   FROM "Notification" n
--   WHERE n.type = 'ACCOUNT_STATUS_CHANGE'
--     AND n."aboutAccountStatusChange"::text LIKE ANY (ARRAY['ADMIN%','MODERATOR%'])
--   GROUP BY 1;
--
-- On the database this was written against every recorded change was a grant,
-- never a revocation, and none of the six accounts had a vote on their comments
-- before it, so reading the status as it is now gives the same answer as
-- reading it as it was. Rather than leave that as a note, the same question is
-- asked below of whatever database this runs on.
DO $$
DECLARE unsettled INT;
BEGIN
    SELECT count(*) INTO unsettled
    FROM "Notification" n
    WHERE n.type = 'ACCOUNT_STATUS_CHANGE'
      AND n."aboutAccountStatusChange"::text LIKE ANY (ARRAY['ADMIN%', 'MODERATOR%'])
      AND EXISTS (
        SELECT 1 FROM "CommentVote" v
        JOIN "Comment" c ON c.id = v."commentId"
        WHERE c."authorId" = n."userId" AND v."createdAt" < n."createdAt"
      );

    IF unsettled > 0 THEN
        RAISE EXCEPTION
            'Cannot tell what % of these votes were paid: their author became or '
            'stopped being staff after the vote was cast, and the old trigger '
            'decided by the status of that moment, which is not recorded. Settle '
            'those rows by hand, then set karmaApplied for them and re-run.',
            unsettled;
    END IF;
END $$;

--
-- Triggers are replaced after migrations run, so the vote trigger live during
-- this statement is the old one, and it reads any update of a vote row as the
-- reader changing their vote. Left enabled it scores and pays every existing
-- vote a second time and writes a karma transaction for each. There is nothing
-- for a trigger to do here in any case: the value being written is the one it
-- would have computed. Disabling also takes the lock that stops a vote being
-- cast, and going unrecorded, while the column is filled.
ALTER TABLE "CommentVote" DISABLE TRIGGER USER;

UPDATE "CommentVote" v
SET "karmaApplied" = CASE WHEN v.downvote THEN -1 ELSE 1 END
FROM "Comment" c
JOIN "User" u ON u.id = c."authorId"
WHERE c.id = v."commentId"
  AND u.admin = false
  AND NOT ('comments:moderate' = ANY(u.capabilities));

-- The vote trigger is replaced here rather than left to the trigger import that
-- follows. Between the two the old trigger would be paying karma for votes this
-- column records as unpaid, and the karma of a vote recorded as unpaid can
-- never be handed back. Doing it here means a vote is either cast before this
-- migration or after it.
--
-- Copied from prisma/triggers/01_karma_tx.sql, which stays the living
-- definition and is reapplied on every deploy. This is the snapshot that made
-- the column true when it was added.
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
    -- Different pairs never wait on each other, and the lock ends with the
    -- transaction.
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

DROP TRIGGER IF EXISTS comment_vote_change_trigger ON "CommentVote";
DROP TRIGGER IF EXISTS set_comment_vote_karma_trigger ON "CommentVote";

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

ALTER TABLE "CommentVote" ENABLE TRIGGER USER;
