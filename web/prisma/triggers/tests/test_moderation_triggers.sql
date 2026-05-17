-- Test suite for comment-moderation triggers.
-- Exercises 03_service_user_rating.sql, 01_karma_tx.sql, 06_notifications_comments.sql.
-- The whole file runs in one transaction; final ROLLBACK leaves the DB untouched.

\set ON_ERROR_STOP on
\set QUIET on

BEGIN;

CREATE TEMP TABLE _results (
    id      SERIAL PRIMARY KEY,
    test    TEXT NOT NULL,
    passed  BOOLEAN NOT NULL,
    detail  TEXT
) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.record(p_test TEXT, p_passed BOOLEAN, p_detail TEXT)
RETURNS VOID AS $$
BEGIN
    INSERT INTO _results(test, passed, detail) VALUES (p_test, p_passed, p_detail);
    IF p_passed THEN
        RAISE NOTICE '[PASS] %  %', p_test, p_detail;
    ELSE
        RAISE WARNING '[FAIL] %  %', p_test, p_detail;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------------------------------
-- Set up shared scaffolding: one isolated service + a pool of test users.
-- The service has no existing comments so we control the rating aggregates.
-- --------------------------------------------------------------------------

DO $setup$
DECLARE
    v_service_id INT;
    v_author_id  INT;
    v_watcher_id INT;
    v_aff_user_id INT;
    v_initial_karma INT := 50;
BEGIN
    INSERT INTO "Service" (name, slug, description, "kycLevel", "serviceVisibility")
    VALUES ('TRIGGER_TEST_SVC', 'trigger-test-svc-' || extract(epoch from clock_timestamp())::BIGINT,
            'temp service for trigger tests', 4, 'HIDDEN')
    RETURNING id INTO v_service_id;

    INSERT INTO "User" (name, "secretTokenHash", "feedId", "totalKarma")
    VALUES ('trigger_test_author_' || extract(epoch from clock_timestamp())::BIGINT,
            'hash_author_' || gen_random_uuid()::TEXT,
            'feed_author_' || gen_random_uuid()::TEXT,
            v_initial_karma)
    RETURNING id INTO v_author_id;

    INSERT INTO "User" (name, "secretTokenHash", "feedId", "totalKarma")
    VALUES ('trigger_test_watcher_' || extract(epoch from clock_timestamp())::BIGINT,
            'hash_watcher_' || gen_random_uuid()::TEXT,
            'feed_watcher_' || gen_random_uuid()::TEXT,
            0)
    RETURNING id INTO v_watcher_id;

    INSERT INTO "User" (name, "secretTokenHash", "feedId", "totalKarma")
    VALUES ('trigger_test_aff_' || extract(epoch from clock_timestamp())::BIGINT,
            'hash_aff_' || gen_random_uuid()::TEXT,
            'feed_aff_' || gen_random_uuid()::TEXT,
            100)
    RETURNING id INTO v_aff_user_id;

    INSERT INTO "NotificationPreferences" ("userId", "enableOnMyCommentStatusChange")
    VALUES (v_watcher_id, true);
    INSERT INTO "NotificationPreferences" ("userId", "enableOnMyCommentStatusChange")
    VALUES (v_author_id, true);
    INSERT INTO "NotificationPreferences" ("userId", "enableOnMyCommentStatusChange")
    VALUES (v_aff_user_id, true);

    -- Stash ids in a temp table for the rest of the suite to read.
    CREATE TEMP TABLE _ctx (
        service_id INT,
        author_id  INT,
        watcher_id INT,
        aff_user_id INT,
        author_initial_karma INT
    ) ON COMMIT DROP;
    INSERT INTO _ctx VALUES (v_service_id, v_author_id, v_watcher_id, v_aff_user_id, v_initial_karma);
END;
$setup$;

-- --------------------------------------------------------------------------
-- T1: karma-tier weight for an active user (karma 50 -> 0.45 "Active user").
-- --------------------------------------------------------------------------
DO $t1$
DECLARE
    v_service_id INT;
    v_author_id  INT;
    v_comment_id INT;
    v_weight     DOUBLE PRECISION;
    v_label      TEXT;
    v_reason     TEXT;
BEGIN
    SELECT service_id, author_id INTO v_service_id, v_author_id FROM _ctx;

    INSERT INTO "Comment" (content, rating, status, "ratingActive", "ratingMuted",
                            "authorId", "serviceId", "privateProofStatus")
    VALUES ('T1 root review', 5, 'APPROVED', true, false, v_author_id, v_service_id, 'PENDING')
    RETURNING id INTO v_comment_id;

    SELECT "ratingWeight", "ratingTrustLabel", "ratingTrustReason"
      INTO v_weight, v_label, v_reason
    FROM "Comment" WHERE id = v_comment_id;

    PERFORM pg_temp.record(
        'T1 karma-tier weight (karma=50)',
        v_weight = 0.45 AND v_label = 'Active user',
        format('got weight=%s label=%L reason=%L', v_weight, v_label, v_reason)
    );
END;
$t1$;

-- --------------------------------------------------------------------------
-- T2: ratingMuted=true with SUSPICIOUS_PATTERN -> weight 0, karma -10,
--     KarmaTransaction COMMENT_SPAM exists.
-- --------------------------------------------------------------------------
DO $t2$
DECLARE
    v_service_id   INT;
    v_author_id    INT;
    v_init_karma   INT;
    v_comment_id   INT;
    v_weight       DOUBLE PRECISION;
    v_reason       TEXT;
    v_karma_now    INT;
    v_kt_count     INT;
    v_pass         BOOLEAN;
BEGIN
    SELECT service_id, author_id, author_initial_karma
      INTO v_service_id, v_author_id, v_init_karma FROM _ctx;

    SELECT id INTO v_comment_id FROM "Comment"
     WHERE "authorId" = v_author_id AND "serviceId" = v_service_id
     ORDER BY id DESC LIMIT 1;

    UPDATE "Comment"
       SET "ratingMuted" = true,
           "ratingMuteReason" = 'SUSPICIOUS_PATTERN'
     WHERE id = v_comment_id;

    SELECT "ratingWeight", "ratingTrustReason" INTO v_weight, v_reason
      FROM "Comment" WHERE id = v_comment_id;

    SELECT "totalKarma" INTO v_karma_now FROM "User" WHERE id = v_author_id;
    SELECT COUNT(*) INTO v_kt_count FROM "KarmaTransaction"
      WHERE "commentId" = v_comment_id AND action = 'COMMENT_SPAM' AND points = -10;

    v_pass := v_weight = 0
              AND v_reason = 'Marked as suspicious'
              AND v_karma_now = v_init_karma - 10
              AND v_kt_count = 1;

    PERFORM pg_temp.record(
        'T2 mute SUSPICIOUS_PATTERN penalty',
        v_pass,
        format('weight=%s reason=%L karma=%s expected_karma=%s spam_tx_count=%s',
               v_weight, v_reason, v_karma_now, v_init_karma - 10, v_kt_count)
    );
END;
$t2$;

-- --------------------------------------------------------------------------
-- T3: switch SUSPICIOUS_PATTERN -> AUTHOR_AFFILIATED (still muted).
--     weight stays 0 (different reason text), karma reverts (+10),
--     COMMENT_SPAM_REVERTED tx exists.
-- --------------------------------------------------------------------------
DO $t3$
DECLARE
    v_service_id INT;
    v_author_id  INT;
    v_init_karma INT;
    v_comment_id INT;
    v_weight     DOUBLE PRECISION;
    v_reason     TEXT;
    v_karma_now  INT;
    v_rev_count  INT;
    v_pass       BOOLEAN;
BEGIN
    SELECT service_id, author_id, author_initial_karma
      INTO v_service_id, v_author_id, v_init_karma FROM _ctx;

    SELECT id INTO v_comment_id FROM "Comment"
     WHERE "authorId" = v_author_id AND "serviceId" = v_service_id
     ORDER BY id DESC LIMIT 1;

    UPDATE "Comment" SET "ratingMuteReason" = 'AUTHOR_AFFILIATED' WHERE id = v_comment_id;

    SELECT "ratingWeight", "ratingTrustReason" INTO v_weight, v_reason
      FROM "Comment" WHERE id = v_comment_id;
    SELECT "totalKarma" INTO v_karma_now FROM "User" WHERE id = v_author_id;
    SELECT COUNT(*) INTO v_rev_count FROM "KarmaTransaction"
      WHERE "commentId" = v_comment_id AND action = 'COMMENT_SPAM_REVERTED' AND points = 10;

    v_pass := v_weight = 0
              AND v_reason = 'Author is affiliated with the service'
              AND v_karma_now = v_init_karma
              AND v_rev_count = 1;

    PERFORM pg_temp.record(
        'T3 swap mute reason to AUTHOR_AFFILIATED reverts penalty',
        v_pass,
        format('weight=%s reason=%L karma=%s expected=%s reverted_tx=%s',
               v_weight, v_reason, v_karma_now, v_init_karma, v_rev_count)
    );
END;
$t3$;

-- --------------------------------------------------------------------------
-- T4: brand-new comment with ratingMuted=true + AUTHOR_AFFILIATED from the
--     start. weight=0, correct reason, no karma transaction created.
-- --------------------------------------------------------------------------
DO $t4$
DECLARE
    v_service_id INT;
    v_author_id  INT;
    v_init_karma INT;
    v_comment_id INT;
    v_weight     DOUBLE PRECISION;
    v_reason     TEXT;
    v_karma_now  INT;
    v_kt_count   INT;
    v_pass       BOOLEAN;
BEGIN
    SELECT service_id, author_id, author_initial_karma
      INTO v_service_id, v_author_id, v_init_karma FROM _ctx;

    INSERT INTO "Comment" (content, rating, status, "ratingActive", "ratingMuted",
                           "ratingMuteReason", "authorId", "serviceId", "privateProofStatus")
    VALUES ('T4 affiliated review', 4, 'APPROVED', true, true,
            'AUTHOR_AFFILIATED', v_author_id, v_service_id, 'PENDING')
    RETURNING id INTO v_comment_id;

    SELECT "ratingWeight", "ratingTrustReason" INTO v_weight, v_reason
      FROM "Comment" WHERE id = v_comment_id;
    SELECT "totalKarma" INTO v_karma_now FROM "User" WHERE id = v_author_id;
    SELECT COUNT(*) INTO v_kt_count FROM "KarmaTransaction"
      WHERE "commentId" = v_comment_id;

    v_pass := v_weight = 0
              AND v_reason = 'Author is affiliated with the service'
              AND v_karma_now = v_init_karma
              AND v_kt_count = 0;

    PERFORM pg_temp.record(
        'T4 mute AUTHOR_AFFILIATED at insert: no karma side-effect',
        v_pass,
        format('weight=%s reason=%L karma_unchanged=%s kt_for_comment=%s',
               v_weight, v_reason, v_karma_now = v_init_karma, v_kt_count)
    );
END;
$t4$;

-- --------------------------------------------------------------------------
-- T5: privateProofStatus PENDING -> APPROVED bumps weight to 0.9
--     ("Verified customer"). Use a fresh user to avoid spillover.
-- --------------------------------------------------------------------------
DO $t5$
DECLARE
    v_service_id INT;
    v_t5_user    INT;
    v_comment_id INT;
    v_weight     DOUBLE PRECISION;
    v_label      TEXT;
    v_pass       BOOLEAN;
BEGIN
    SELECT service_id INTO v_service_id FROM _ctx;

    INSERT INTO "User" (name, "secretTokenHash", "feedId", "totalKarma")
    VALUES ('trigger_test_t5_' || gen_random_uuid()::TEXT,
            'hash_t5_' || gen_random_uuid()::TEXT,
            'feed_t5_' || gen_random_uuid()::TEXT,
            10)
    RETURNING id INTO v_t5_user;

    INSERT INTO "Comment" (content, rating, status, "ratingActive", "ratingMuted",
                           "authorId", "serviceId", "privateProofStatus", "privateProof")
    VALUES ('T5 review with private proof', 4, 'APPROVED', true, false,
            v_t5_user, v_service_id, 'PENDING', 'proof-t5-' || gen_random_uuid()::TEXT)
    RETURNING id INTO v_comment_id;

    UPDATE "Comment" SET "privateProofStatus" = 'APPROVED' WHERE id = v_comment_id;

    SELECT "ratingWeight", "ratingTrustLabel" INTO v_weight, v_label
      FROM "Comment" WHERE id = v_comment_id;

    v_pass := v_weight = 0.9 AND v_label = 'Verified customer';

    PERFORM pg_temp.record(
        'T5 privateProofStatus APPROVED -> weight 0.9',
        v_pass,
        format('weight=%s label=%L', v_weight, v_label)
    );
END;
$t5$;

-- --------------------------------------------------------------------------
-- T6: recalculate_service_user_rating excludes ratingMuted rows.
--     Insert a counted comment, verify the average appears, then mute it
--     and verify the average drops back to NULL.
-- --------------------------------------------------------------------------
DO $t6$
DECLARE
    v_service_id INT;
    v_t6_user    INT;
    v_comment_id INT;
    v_avg_before DOUBLE PRECISION;
    v_count_before INT;
    v_avg_after  DOUBLE PRECISION;
    v_count_after INT;
    v_pass       BOOLEAN;
BEGIN
    -- Use a fresh service so T5's counted review can't pollute aggregates.
    INSERT INTO "Service" (name, slug, description, "kycLevel", "serviceVisibility")
    VALUES ('TRIGGER_TEST_SVC_T6',
            'trigger-test-svc-t6-' || extract(epoch from clock_timestamp())::BIGINT,
            'temp service for T6', 4, 'HIDDEN')
    RETURNING id INTO v_service_id;

    INSERT INTO "User" (name, "secretTokenHash", "feedId", "totalKarma")
    VALUES ('trigger_test_t6_' || gen_random_uuid()::TEXT,
            'hash_t6_' || gen_random_uuid()::TEXT,
            'feed_t6_' || gen_random_uuid()::TEXT,
            200)  -- high karma -> weight 0.8, contributes to averages
    RETURNING id INTO v_t6_user;

    INSERT INTO "Comment" (content, rating, status, "ratingActive", "ratingMuted",
                           "authorId", "serviceId", "privateProofStatus")
    VALUES ('T6 counted review', 5, 'APPROVED', true, false,
            v_t6_user, v_service_id, 'PENDING')
    RETURNING id INTO v_comment_id;

    SELECT "averageUserRating", "userRatingCount"
      INTO v_avg_before, v_count_before
      FROM "Service" WHERE id = v_service_id;

    UPDATE "Comment"
       SET "ratingMuted" = true,
           "ratingMuteReason" = 'MODERATOR_DISCRETION'
     WHERE id = v_comment_id;

    SELECT "averageUserRating", "userRatingCount"
      INTO v_avg_after, v_count_after
      FROM "Service" WHERE id = v_service_id;

    v_pass := v_avg_before = 5
              AND v_count_before = 1
              AND v_avg_after IS NULL
              AND v_count_after = 0;

    PERFORM pg_temp.record(
        'T6 averageUserRating excludes muted rows',
        v_pass,
        format('before: avg=%s count=%s | after-mute: avg=%s count=%s',
               v_avg_before, v_count_before, v_avg_after, v_count_after)
    );
END;
$t6$;

-- --------------------------------------------------------------------------
-- T7: humanAction null -> HOLD on a comment with a watcher.
--     Notification with aboutCommentStatusChange = MARKED_FOR_ADMIN_REVIEW
--     should appear for that watcher.
-- --------------------------------------------------------------------------
DO $t7$
DECLARE
    v_service_id INT;
    v_author_id  INT;
    v_watcher_id INT;
    v_t7_user    INT;
    v_comment_id INT;
    v_watcher_prefs_id INT;
    v_notif_count INT;
    v_pass        BOOLEAN;
BEGIN
    SELECT service_id, author_id, watcher_id
      INTO v_service_id, v_author_id, v_watcher_id FROM _ctx;

    INSERT INTO "User" (name, "secretTokenHash", "feedId", "totalKarma")
    VALUES ('trigger_test_t7author_' || gen_random_uuid()::TEXT,
            'hash_t7a_' || gen_random_uuid()::TEXT,
            'feed_t7a_' || gen_random_uuid()::TEXT,
            10)
    RETURNING id INTO v_t7_user;

    INSERT INTO "Comment" (content, status, "authorId", "serviceId")
    VALUES ('T7 watched comment', 'APPROVED', v_t7_user, v_service_id)
    RETURNING id INTO v_comment_id;

    SELECT id INTO v_watcher_prefs_id
      FROM "NotificationPreferences" WHERE "userId" = v_watcher_id;

    INSERT INTO "_watchedComments" ("A", "B") VALUES (v_comment_id, v_watcher_prefs_id);

    UPDATE "Comment" SET "humanAction" = 'HOLD' WHERE id = v_comment_id;

    SELECT COUNT(*) INTO v_notif_count
      FROM "Notification"
     WHERE "userId" = v_watcher_id
       AND "aboutCommentId" = v_comment_id
       AND type = 'COMMENT_STATUS_CHANGE'
       AND "aboutCommentStatusChange" = 'MARKED_FOR_ADMIN_REVIEW';

    v_pass := v_notif_count = 1;

    PERFORM pg_temp.record(
        'T7 humanAction -> HOLD notifies watchers',
        v_pass,
        format('matching notification rows=%s', v_notif_count)
    );
END;
$t7$;

-- --------------------------------------------------------------------------
-- Summary.
-- --------------------------------------------------------------------------
\echo ''
\echo '================ TEST SUMMARY ================'
SELECT
    id,
    CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS status,
    test,
    detail
FROM _results
ORDER BY id;

SELECT
    COUNT(*) FILTER (WHERE passed) AS passed,
    COUNT(*) FILTER (WHERE NOT passed) AS failed,
    COUNT(*) AS total
FROM _results;

ROLLBACK;
