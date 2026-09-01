-- Properties the comment-vote karma trigger must hold. Run against a database
-- with the triggers imported; it rolls back and writes nothing.
--
--   docker compose exec -T database psql -U kycnot -d kycnot \
--     -f web/prisma/checks/karma_vote_guards.sql
--
-- Deliberately not under triggers/, which `just import-triggers` runs wholesale.
BEGIN;
DO $$
DECLARE
    author_id INT; voter_a INT; voter_b INT;
    comment_ids INT[]; before_karma INT; after_karma INT; i INT;
BEGIN
    SELECT c."authorId", array_agg(c.id) INTO author_id, comment_ids
    FROM "Comment" c JOIN "User" u ON u.id = c."authorId"
    WHERE u.admin = false AND NOT ('comments:moderate' = ANY(u.capabilities))
    GROUP BY c."authorId" HAVING count(*) >= 8 LIMIT 1;

    IF author_id IS NULL THEN
        RAISE NOTICE 'skipped: no non-moderator author with 8 comments in this database';
        RETURN;
    END IF;

    SELECT id INTO voter_a FROM "User" WHERE id <> author_id AND admin = false ORDER BY id LIMIT 1;
    SELECT id INTO voter_b FROM "User" WHERE id NOT IN (author_id, voter_a) AND admin = false ORDER BY id DESC LIMIT 1;
    DELETE FROM "CommentVote" WHERE "userId" IN (author_id, voter_a, voter_b) AND "commentId" = ANY(comment_ids);

    SELECT "totalKarma" INTO before_karma FROM "User" WHERE id = author_id;
    INSERT INTO "CommentVote" ("commentId","userId",downvote) VALUES (comment_ids[1], author_id, false);
    SELECT "totalKarma" INTO after_karma FROM "User" WHERE id = author_id;
    IF after_karma <> before_karma THEN
        RAISE EXCEPTION 'voting on your own comment moved karma by %', after_karma - before_karma;
    END IF;

    SELECT "totalKarma" INTO before_karma FROM "User" WHERE id = author_id;
    FOR i IN 2..6 LOOP
        INSERT INTO "CommentVote" ("commentId","userId",downvote) VALUES (comment_ids[i], voter_a, false);
    END LOOP;
    SELECT "totalKarma" INTO after_karma FROM "User" WHERE id = author_id;
    IF after_karma - before_karma > 3 THEN
        RAISE EXCEPTION 'one voter moved % karma for one author, over the cap', after_karma - before_karma;
    END IF;

    SELECT "totalKarma" INTO before_karma FROM "User" WHERE id = author_id;
    INSERT INTO "CommentVote" ("commentId","userId",downvote) VALUES (comment_ids[7], voter_b, false);
    SELECT "totalKarma" INTO after_karma FROM "User" WHERE id = author_id;
    IF after_karma - before_karma <> 1 THEN
        RAISE EXCEPTION 'a second, unrelated voter was blocked (change %)', after_karma - before_karma;
    END IF;

    -- Churning votes must not move karma the cap already refused, in either
    -- direction. Deciding the cap again at reversal time let this sequence end
    -- 2 karma below where it started, with every vote row gone and every
    -- upvote counter back to its old value, so nothing on screen showed it.
    DELETE FROM "CommentVote" WHERE "userId" IN (voter_a, voter_b) AND "commentId" = ANY(comment_ids);
    SELECT "totalKarma" INTO before_karma FROM "User" WHERE id = author_id;

    INSERT INTO "CommentVote" ("commentId","userId",downvote) VALUES (comment_ids[1], voter_a, false);
    INSERT INTO "CommentVote" ("commentId","userId",downvote) VALUES (comment_ids[2], voter_a, false);
    INSERT INTO "CommentVote" ("commentId","userId",downvote) VALUES (comment_ids[3], voter_a, true);
    INSERT INTO "CommentVote" ("commentId","userId",downvote) VALUES (comment_ids[4], voter_a, false);
    UPDATE "CommentVote" SET downvote = false WHERE "userId" = voter_a AND "commentId" = comment_ids[3];
    DELETE FROM "CommentVote" WHERE "userId" = voter_a AND "commentId" = ANY(comment_ids[1:4]);

    SELECT "totalKarma" INTO after_karma FROM "User" WHERE id = author_id;
    IF after_karma <> before_karma THEN
        RAISE EXCEPTION 'churning votes left karma % off where it started', after_karma - before_karma;
    END IF;

    -- The same property stated directly: what a pair still owes is the sum of
    -- what its live votes were paid, so with no votes left it owes nothing.
    IF EXISTS (
        SELECT 1 FROM "CommentVote" v JOIN "Comment" c ON c.id = v."commentId"
        WHERE v."userId" = voter_a AND c."authorId" = author_id AND v."karmaApplied" <> 0
    ) THEN
        RAISE EXCEPTION 'a vote survived its own deletion still owed karma';
    END IF;

    -- A self-vote must not raise the public score either.
    SELECT upvotes INTO before_karma FROM "Comment" WHERE id = comment_ids[8];
    INSERT INTO "CommentVote" ("commentId","userId",downvote) VALUES (comment_ids[8], author_id, false);
    SELECT upvotes INTO after_karma FROM "Comment" WHERE id = comment_ids[8];
    IF after_karma <> before_karma THEN
        RAISE EXCEPTION 'voting on your own comment moved its score by %', after_karma - before_karma;
    END IF;

    -- Two requests can both read the same vote and both take the update branch.
    -- The second then runs against the row the first already flipped, so the
    -- direction does not change. Counted as a flip anyway it is worth another
    -- two points on a public sort key, and it can be repeated.
    DELETE FROM "CommentVote" WHERE "userId" = voter_a AND "commentId" = comment_ids[1];
    INSERT INTO "CommentVote" ("commentId","userId",downvote) VALUES (comment_ids[1], voter_a, false);
    UPDATE "CommentVote" SET downvote = true WHERE "userId" = voter_a AND "commentId" = comment_ids[1];
    SELECT upvotes INTO before_karma FROM "Comment" WHERE id = comment_ids[1];

    UPDATE "CommentVote" SET downvote = true WHERE "userId" = voter_a AND "commentId" = comment_ids[1];
    UPDATE "CommentVote" SET downvote = true WHERE "userId" = voter_a AND "commentId" = comment_ids[1];

    SELECT upvotes INTO after_karma FROM "Comment" WHERE id = comment_ids[1];
    IF after_karma <> before_karma THEN
        RAISE EXCEPTION 'an update that changed nothing moved the score by %', after_karma - before_karma;
    END IF;

    RAISE NOTICE 'ok: self-votes pay nothing and score nothing, one voter is capped, a second voter still counts, churn nets to zero, a repeated update scores nothing';
END $$;
ROLLBACK;
