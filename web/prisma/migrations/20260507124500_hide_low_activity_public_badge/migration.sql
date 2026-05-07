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

    RETURN QUERY SELECT 0.1::DOUBLE PRECISION, NULL::TEXT, 'Author has little account activity'::TEXT;
END;
$$ LANGUAGE plpgsql;

UPDATE "Comment"
SET "ratingWeight" = "ratingWeight"
WHERE rating IS NOT NULL;

SELECT recalculate_service_user_rating(id)
FROM "Service";
