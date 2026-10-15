-- get_comment_moderation_context(p_comment_id, p_content)
-- p_content replaces the post's text when moderating an edit, so the similarity and
-- brigade signals describe the edited text, not the published one.
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
DROP FUNCTION IF EXISTS get_comment_moderation_context(INT, TEXT);

CREATE OR REPLACE FUNCTION get_comment_moderation_context(p_comment_id INT, p_content TEXT DEFAULT NULL)
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
    -- A wave is this many other experiences with the same sentiment from new accounts on one service in a day.
    v_wave_window            INTERVAL := '24 hours'::INTERVAL;
    v_new_account_age        INTERVAL := '7 days'::INTERVAL;
    v_wave_size              INT      := 4;

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
    v_sentiment         TEXT;
    v_wave              BOOLEAN;
    v_cross_service_window INTERVAL := '30 days'::INTERVAL;
    v_max_cross_service_samples INT := 5;
    v_cross_service_content_limit INT := 300;
BEGIN
    SELECT
        c.id, COALESCE(p_content, c.content) AS content, c."authorId", c."serviceId", c."parentId", c."replyToId",
        c."createdAt", c.kind,
        c.issues,
        u."createdAt"   AS author_created,
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

    -- Signups around the author's own signup only hint at a brigade while the account is new.
    IF v_target."createdAt" - v_target.author_created < INTERVAL '7 days' THEN
        SELECT COUNT(*)
        INTO v_new_user_spike
        FROM "User" u2
        WHERE u2.id <> v_target."authorId"
          AND u2."createdAt" BETWEEN v_target.author_created - INTERVAL '1 hour'
                                  AND v_target.author_created + INTERVAL '1 hour';
    ELSE
        v_new_user_spike := 0;
    END IF;

    SELECT sentiment::TEXT INTO v_sentiment FROM "CommentExperience" WHERE "commentId" = p_comment_id;
    -- Shilling and brigades both arrive as same-sentiment posts from fresh accounts, so either direction counts.
    v_wave := v_target."parentId" IS NULL
        AND v_target."createdAt" - v_target.author_created < v_new_account_age
        AND (
            SELECT COUNT(DISTINCT c."authorId")
            FROM "Comment" c
            JOIN "User" u ON u.id = c."authorId"
            JOIN "CommentExperience" e ON e."commentId" = c.id
            WHERE c."serviceId" = v_target."serviceId" AND c.id <> p_comment_id AND c."parentId" IS NULL
              AND c."authorId" <> v_target."authorId" AND c.status IN ('APPROVED', 'PENDING')
              AND c."createdAt" BETWEEN v_target."createdAt" - v_wave_window AND v_target."createdAt"
              AND c."createdAt" - u."createdAt" < v_new_account_age
              AND (v_sentiment IS NULL OR e.sentiment::TEXT = v_sentiment)
        ) >= v_wave_size;

    v_comment_obj := jsonb_build_object(
        'content', v_target.content,
        'submission', jsonb_build_object(
            'isRootReview', v_target."parentId" IS NULL,
            'hasPrivateProof', EXISTS (SELECT 1 FROM "CommentEvidence" WHERE "commentId" = p_comment_id AND "removedAt" IS NULL),
            'hasAcceptedProof', comment_has_accepted_proof(p_comment_id),
            'changesVerdict', EXISTS (SELECT 1 FROM "ExperienceUpdate" WHERE "commentId" = p_comment_id AND (sentiment IS NOT NULL OR outcome IS NOT NULL)),
            'experienceHasCheckedProof', EXISTS (
                SELECT 1 FROM "ExperienceUpdate" u JOIN "CommentExperience" e ON e.id = u."experienceId"
                WHERE u."commentId" = p_comment_id AND comment_has_accepted_proof(e."commentId")
            ),
            -- The same order ID on another author's post of this service, ignoring case.
            'proofIdReused', EXISTS (
                SELECT 1 FROM "CommentEvidence" mine
                JOIN "CommentEvidence" other ON lower(other."normalizedId") = lower(mine."normalizedId")
                    AND other."commentId" <> mine."commentId" AND other."removedAt" IS NULL
                JOIN "Comment" oc ON oc.id = other."commentId" AND oc."serviceId" = v_target."serviceId"
                    AND oc."authorId" IS DISTINCT FROM v_target."authorId" AND oc.status IN ('APPROVED', 'PENDING')
                WHERE mine."commentId" = p_comment_id AND mine."removedAt" IS NULL AND mine."normalizedId" IS NOT NULL
            ),
            'proofIdOffFormat', EXISTS (
                SELECT 1 FROM "CommentEvidence"
                WHERE "commentId" = p_comment_id AND "removedAt" IS NULL AND "formatValid" = false
                  AND kind IN ('ORDER_ID', 'LOOKUP_LINK')
            ),
            'newAccountWave', v_wave,
            'kind', v_target.kind,
            'sentiment', v_sentiment,
            'issues', v_target.issues
        ),
        'author', jsonb_build_object(
            'name', v_target.author_name,
            'displayName', v_target.author_display_name,
            'accountAgeMinutes', GREATEST(0, ROUND(EXTRACT(EPOCH FROM (v_target."createdAt" - v_target.author_created)) / 60)),
            'trust', (SELECT jsonb_build_object(
                'publishedPosts', t."publishedPosts",
                'postsWithCheckedProof', t."checkedProofPosts",
                'penalizingRejectionsLast90Days', t."penalizingRejections",
                'isUntrusted', t.untrusted,
                'postingDisabled', t."commentsDisabled",
                'postsWithdrawnWhileWaiting', (
                    SELECT COUNT(*) FROM "Comment" w WHERE w."authorId" = v_target."authorId" AND w."withdrawnWhileWaiting"
                )
            ) FROM user_trust(ARRAY[v_target."authorId"]) t),
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
            c."authorId",
            u."createdAt" AS author_created,
            EXTRACT(EPOCH FROM (v_target."createdAt" - c."createdAt"))/60::FLOAT AS minutes_before,
            EXTRACT(EPOCH FROM (c."createdAt" - u."createdAt"))/60::FLOAT AS author_age_at_write_min,
            similarity(c.content, v_target.content) AS sim
        FROM "Comment" c
        JOIN "User" u ON u.id = c."authorId"
        WHERE c."serviceId" = v_target."serviceId"
          AND c.id <> p_comment_id
          AND c."authorId" <> v_target."authorId"
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
        'freshAccountsLast72h', (SELECT COUNT(DISTINCT "authorId") FROM siblings_raw),
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
            c.id, c.content,
            ROUND((EXTRACT(EPOCH FROM (v_target."createdAt" - c."createdAt"))/86400)::numeric, 1) AS days_ago
        FROM "Comment" c
        WHERE c."serviceId" = v_target."serviceId"
          AND c.status = 'APPROVED'
          AND c."parentId" IS NULL
          AND c.id <> p_comment_id
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
                c.id, c.content, c."parentId", c."replyToId", c."createdAt", c."authorId",
                1 AS depth
            FROM "Comment" c
            WHERE c.id = COALESCE(v_target."replyToId", v_target."parentId")
            UNION ALL
            SELECT
                c.id, c.content, c."parentId", c."replyToId", c."createdAt", c."authorId",
                a.depth + 1
            FROM "Comment" c
            JOIN ancestors a ON c.id = COALESCE(a."replyToId", a."parentId")
            WHERE a.depth < v_max_thread_depth
        ),
        ancestors_enriched AS (
            SELECT
                a.id, a.content, a."parentId", a."createdAt", a.depth,
                u.name AS author_name,
                u."displayName" AS author_display_name,
                u."createdAt" AS author_created,
                u.verified AS author_verified,
                su.role
            FROM ancestors a
            LEFT JOIN "User" u ON u.id = a."authorId"
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
                'content',
                    CASE
                        WHEN ae.depth = 1 THEN LEFT(ae.content, v_parent_content_limit)
                        ELSE LEFT(ae.content, v_ancestor_content_limit)
                    END,
                'author', jsonb_build_object(
                    'name', COALESCE(ae.author_name, '[deleted account]'),
                    'displayName', ae.author_display_name,
                    'accountAgeMinutes', GREATEST(0, ROUND(EXTRACT(EPOCH FROM (ae."createdAt" - ae.author_created))/60)),
                    'isVerified', COALESCE(ae.author_verified, false),
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
