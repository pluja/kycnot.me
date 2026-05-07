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
        SELECT EXISTS(
            SELECT 1 FROM "ServiceUser"
            WHERE "userId" = NEW."authorId" AND "serviceId" = NEW."serviceId"
        ) INTO is_user_related_to_service;

        SELECT (admin = true OR moderator = true)
        FROM "User"
        WHERE id = NEW."authorId"
        INTO is_user_admin_or_moderator;

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

WITH missing_approval_karma AS (
    SELECT
        c.id AS "commentId",
        c."authorId",
        format('Your comment #comment-%s in %s has been approved!', c.id, s.name) AS description,
        c."updatedAt" AS "createdAt"
    FROM "Comment" c
    JOIN "Service" s ON s.id = c."serviceId"
    JOIN "User" u ON u.id = c."authorId"
    WHERE c.status = 'APPROVED'
    AND NOT u.admin
    AND NOT u.moderator
    AND NOT EXISTS (
        SELECT 1
        FROM "ServiceUser" su
        WHERE su."userId" = c."authorId"
        AND su."serviceId" = c."serviceId"
    )
    AND NOT EXISTS (
        SELECT 1
        FROM "KarmaTransaction" kt
        WHERE kt."commentId" = c.id
        AND kt.action = 'COMMENT_APPROVED'
    )
)
INSERT INTO "KarmaTransaction" (
    "userId",
    points,
    action,
    "commentId",
    description,
    processed,
    "createdAt"
)
SELECT
    "authorId",
    1,
    'COMMENT_APPROVED'::"KarmaTransactionAction",
    "commentId",
    description,
    true,
    "createdAt"
FROM missing_approval_karma;

UPDATE "User" u
SET "totalKarma" = COALESCE(t.points, 0)
FROM (
    SELECT "userId", SUM(points)::INT AS points
    FROM "KarmaTransaction"
    GROUP BY "userId"
) t
WHERE u.id = t."userId";

UPDATE "User" u
SET "totalKarma" = 0
WHERE NOT EXISTS (
    SELECT 1
    FROM "KarmaTransaction" kt
    WHERE kt."userId" = u.id
);


CREATE OR REPLACE FUNCTION calculate_comment_rating_trust(
    p_rating INT,
    p_rating_active BOOLEAN,
    p_rating_disabled_by_moderator BOOLEAN,
    p_parent_id INT,
    p_status "CommentStatus",
    p_suspicious BOOLEAN,
    p_order_id_status "OrderIdStatus",
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

    IF p_rating_disabled_by_moderator IS TRUE THEN
        RETURN QUERY SELECT 0::DOUBLE PRECISION, 'Not counted'::TEXT, 'Rating was disabled by a moderator'::TEXT;
        RETURN;
    END IF;

    IF p_suspicious IS TRUE THEN
        RETURN QUERY SELECT 0::DOUBLE PRECISION, 'Not counted'::TEXT, 'Marked as suspicious'::TEXT;
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

    SELECT u."totalKarma", u.spammer, u.admin, u.moderator, u.verified
    INTO author_record
    FROM "User" u
    WHERE u.id = p_author_id;

    IF author_record IS NULL THEN
        RETURN QUERY SELECT 0::DOUBLE PRECISION, 'Not counted'::TEXT, 'Author account was not found'::TEXT;
        RETURN;
    END IF;

    IF author_record.spammer IS TRUE OR author_record."totalKarma" <= -30 THEN
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

    IF p_order_id_status = 'APPROVED'::"OrderIdStatus" THEN
        RETURN QUERY SELECT 0.9::DOUBLE PRECISION, 'Verified customer'::TEXT, 'Private proof was approved'::TEXT;
        RETURN;
    END IF;

    IF author_record.admin IS TRUE OR author_record.moderator IS TRUE THEN
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

    RETURN QUERY SELECT 0.1::DOUBLE PRECISION, 'Limited history'::TEXT, 'Author has little account activity'::TEXT;
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
        NEW."ratingDisabledByModerator",
        NEW."parentId",
        NEW.status,
        NEW.suspicious,
        NEW."orderIdStatus",
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
    AND c.suspicious = false;

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


UPDATE "Comment"
SET "ratingWeight" = "ratingWeight"
WHERE rating IS NOT NULL;

SELECT recalculate_service_user_rating(id)
FROM "Service";
