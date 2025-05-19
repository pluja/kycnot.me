-- This script defines a PostgreSQL function and trigger to automatically calculate 
-- and update the average user rating for services based on associated comments.
-- The average rating is recalculated whenever comments are added, updated, or deleted.

-- Drop existing triggers first
DROP TRIGGER IF EXISTS comment_average_rating_trigger ON "Comment";

-- Drop existing functions
DROP FUNCTION IF EXISTS calculate_average_rating();

-- Calculate average rating based on active comments with approved or verified status
CREATE OR REPLACE FUNCTION calculate_average_rating() 
RETURNS TRIGGER AS $$
DECLARE
    affected_service_id INT;
    average_user_rating DECIMAL;
BEGIN
    -- Determine which service ID to use based on the trigger context
    IF TG_OP = 'DELETE' THEN
        affected_service_id := OLD."serviceId";
    ELSE -- INSERT or UPDATE
        affected_service_id := NEW."serviceId";
    END IF;
    
    -- Calculate average rating from active comments with approved or verified status
    -- Excluding suspicious comments and replies (comments with parentId not null)

    SELECT AVG(rating) INTO average_user_rating
    FROM "Comment"
    WHERE "serviceId" = affected_service_id 
    AND "parentId" IS NULL
    AND rating IS NOT NULL
    AND (status = 'APPROVED' OR status = 'VERIFIED')
    AND "ratingActive" = true
    AND suspicious = false;
    
    -- Update the service with the new average rating
    UPDATE "Service"
    SET "averageUserRating" = average_user_rating
    WHERE "id" = affected_service_id;
    
    -- Return the appropriate record based on operation
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to recalculate average rating when comments are created, updated, or deleted
CREATE TRIGGER comment_average_rating_trigger
    AFTER INSERT OR UPDATE OR DELETE
    ON "Comment"
    FOR EACH ROW
    WHEN (pg_trigger_depth() < 2)  -- Prevent recursive triggering
    EXECUTE FUNCTION calculate_average_rating(); 