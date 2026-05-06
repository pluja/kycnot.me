DROP TRIGGER IF EXISTS comment_rating_trust_before_write_trigger ON "Comment";
DROP TRIGGER IF EXISTS comment_average_rating_trigger ON "Comment";
DROP TRIGGER IF EXISTS user_rating_trust_trigger ON "User";
DROP TRIGGER IF EXISTS service_user_rating_trust_trigger ON "ServiceUser";

DROP FUNCTION IF EXISTS calculate_comment_rating_trust(INT, BOOLEAN, INT, "CommentStatus", BOOLEAN, "OrderIdStatus", INT, INT);
DROP FUNCTION IF EXISTS set_comment_rating_trust_before_write();
DROP FUNCTION IF EXISTS recalculate_service_user_rating(INT);
DROP FUNCTION IF EXISTS calculate_average_rating();
DROP FUNCTION IF EXISTS refresh_user_comment_rating_trust();
DROP FUNCTION IF EXISTS refresh_service_user_comment_rating_trust();

CREATE OR REPLACE FUNCTION calculate_comment_rating_trust(
    p_rating INT,
    p_rating_active BOOLEAN,
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
    IF p_rating IS NULL OR p_parent_id IS NOT NULL OR p_rating_active IS NOT TRUE THEN
        RETURN QUERY SELECT 0::DOUBLE PRECISION, 'Not counted'::TEXT, 'No active root rating'::TEXT;
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
        RETURN QUERY SELECT 0.9::DOUBLE PRECISION, 'Trusted account'::TEXT, 'Author is a KYCnot.me admin or moderator'::TEXT;
        RETURN;
    END IF;

    IF author_record.verified IS TRUE THEN
        RETURN QUERY SELECT 0.8::DOUBLE PRECISION, 'Trusted account'::TEXT, 'Author account is verified'::TEXT;
        RETURN;
    END IF;

    IF author_record."totalKarma" >= 500 THEN
        RETURN QUERY SELECT 0.8::DOUBLE PRECISION, 'Trusted account'::TEXT, 'Author has high karma'::TEXT;
        RETURN;
    END IF;

    IF author_record."totalKarma" >= 10 THEN
        RETURN QUERY SELECT 0.35::DOUBLE PRECISION, 'Active account'::TEXT, 'Author has account activity'::TEXT;
        RETURN;
    END IF;

    IF author_record."totalKarma" > 0 THEN
        RETURN QUERY SELECT 0.2::DOUBLE PRECISION, 'Some activity'::TEXT, 'Author has some account activity'::TEXT;
        RETURN;
    END IF;

    RETURN QUERY SELECT 0.1::DOUBLE PRECISION, 'New account'::TEXT, 'Author has little account activity'::TEXT;
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
        COUNT(*) FILTER (WHERE c."ratingWeight" >= 0.5)::INT,
        COALESCE(SUM(c."ratingWeight"), 0)::DOUBLE PRECISION,
        CASE
            WHEN COALESCE(SUM(c."ratingWeight"), 0) >= 0.5 THEN
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
    AFTER INSERT OR UPDATE OR DELETE
    ON "Comment"
    FOR EACH ROW
    EXECUTE FUNCTION calculate_average_rating();

CREATE TRIGGER user_rating_trust_trigger
    AFTER UPDATE OF "totalKarma", spammer, verified, admin, moderator
    ON "User"
    FOR EACH ROW
    WHEN (
        OLD."totalKarma" <> NEW."totalKarma"
        OR OLD.spammer <> NEW.spammer
        OR OLD.verified <> NEW.verified
        OR OLD.admin <> NEW.admin
        OR OLD.moderator <> NEW.moderator
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
