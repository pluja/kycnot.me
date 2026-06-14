-- This script defines PostgreSQL functions and triggers for managing service scores:
-- 1. Automatically calculates and updates privacy, trust, and overall scores 
--    for services when services or their attributes change.
-- 2. Updates the isRecentlyApproved flag for services approved within the last 15 days.
-- 3. Queues asynchronous score recalculation in "ServiceScoreRecalculationJob" 
--    when an "Attribute" definition (e.g., points) is updated, ensuring 
--    efficient handling of widespread score updates.

-- Drop existing triggers first
DROP TRIGGER IF EXISTS service_score_update_trigger ON "Service";
DROP TRIGGER IF EXISTS service_attribute_change_trigger ON "ServiceAttribute";
DROP TRIGGER IF EXISTS attribute_change_trigger ON "Attribute";
DROP TRIGGER IF EXISTS incident_score_update_trigger ON "Incident";
DROP TRIGGER IF EXISTS event_incident_update_trigger ON "Event";
DROP TRIGGER IF EXISTS event_incident_delete_trigger ON "Event";

-- Drop existing functions
DROP FUNCTION IF EXISTS calculate_service_scores();
DROP FUNCTION IF EXISTS calculate_privacy_score();
DROP FUNCTION IF EXISTS calculate_trust_score();
DROP FUNCTION IF EXISTS calculate_overall_score();
DROP FUNCTION IF EXISTS recalculate_scores_for_attribute();

-- Calculate privacy score based on service attributes and properties
CREATE OR REPLACE FUNCTION calculate_privacy_score(service_id INT) 
RETURNS INT AS $$
DECLARE
    privacy_score INT := 0;
    kyc_factor INT;
    onion_or_i2p_factor INT := 0;
    monero_factor INT := 0;
    attributes_score INT := 0;
BEGIN
    -- Get service data
    SELECT
        CASE
            WHEN "kycLevel" = 0 THEN 25  -- No KYC is best for privacy
            WHEN "kycLevel" = 1 THEN 10   -- Minimal KYC
            WHEN "kycLevel" = 2 THEN -5  -- Moderate KYC
            WHEN "kycLevel" = 3 THEN -15 -- More KYC
            WHEN "kycLevel" = 4 THEN -25 -- Full mandatory KYC
            ELSE 0                     -- Default to no change
        END
    INTO kyc_factor
    FROM "Service"
    WHERE "id" = service_id;

    -- Check for onion or i2p URLs
    IF EXISTS (
        SELECT 1 FROM "Service" 
        WHERE "id" = service_id AND (array_length("onionUrls", 1) > 0 OR array_length("i2pUrls", 1) > 0)
    ) THEN
        onion_or_i2p_factor := 5;
    END IF;
    
    -- Check for Monero acceptance
    IF EXISTS (
        SELECT 1 FROM "Service" 
        WHERE "id" = service_id AND 'MONERO' = ANY("acceptedCurrencies")
    ) THEN
        monero_factor := 5;
    END IF;
    
    -- Calculate score from privacy attributes - directly use the points
    SELECT COALESCE(SUM(a."privacyPoints"), 0)
    INTO attributes_score
    FROM "ServiceAttribute" sa
    JOIN "Attribute" a ON sa."attributeId" = a."id"
    WHERE sa."serviceId" = service_id;
    
    -- Calculate final privacy score (base 100)
    privacy_score := 50 + kyc_factor + onion_or_i2p_factor + monero_factor + attributes_score;
    
    -- Ensure the score is in reasonable bounds (0-100)
    privacy_score := GREATEST(0, LEAST(100, privacy_score));
    
    RETURN privacy_score;
END;
$$ LANGUAGE plpgsql;

-- Calculate trust score based on service attributes and verification status
CREATE OR REPLACE FUNCTION calculate_trust_score(service_id INT) 
RETURNS INT AS $$
DECLARE
    trust_score INT := 0;
    verification_factor INT;
    attributes_score INT := 0;
    recently_approved_factor INT := 0;
    tos_penalty_factor INT := 0;
    operating_since_factor INT := 0;
    legally_registered_factor INT := 0;
    incident_penalty_factor INT := 0;
BEGIN
    -- Get verification status factor
    SELECT 
        CASE 
            WHEN "verificationStatus" = 'VERIFICATION_SUCCESS' THEN 10
            WHEN "verificationStatus" = 'APPROVED' THEN 5
            WHEN "verificationStatus" = 'COMMUNITY_CONTRIBUTED' THEN 0
            WHEN "verificationStatus" = 'VERIFICATION_FAILED' THEN -50
            ELSE 0
        END
    INTO verification_factor
    FROM "Service" 
    WHERE id = service_id;
    
    -- Calculate score from trust attributes - directly use the points
    SELECT COALESCE(SUM(a."trustPoints"), 0)
    INTO attributes_score
    FROM "ServiceAttribute" sa
    JOIN "Attribute" a ON sa."attributeId" = a.id
    WHERE sa."serviceId" = service_id;

    -- Apply penalty if service was approved within the last 15 days
    IF EXISTS (
        SELECT 1
        FROM "Service"
        WHERE id = service_id 
        AND "approvedAt" IS NOT NULL 
        AND "verificationStatus" = 'APPROVED'
        AND (NOW() - "approvedAt") <= INTERVAL '15 days'
    ) THEN
        recently_approved_factor := -10;
        -- Update the isRecentlyApproved flag to true
        UPDATE "Service"
        SET "isRecentlyApproved" = TRUE
        WHERE id = service_id;
    ELSE
        -- Update the isRecentlyApproved flag to false
        UPDATE "Service"
        SET "isRecentlyApproved" = FALSE
        WHERE id = service_id;
    END IF;

    -- Apply penalty if ToS cannot be analyzed
    IF EXISTS (
        SELECT 1
        FROM "Service"
        WHERE id = service_id 
        AND "tosReviewAt" IS NOT NULL 
        AND "tosReview" IS NULL
    ) THEN
        tos_penalty_factor := -3;
    END IF;
    
    -- Determine trust adjustment based on operatingSince
    SELECT
        CASE
            WHEN "operatingSince" IS NULL THEN 0
            WHEN AGE(NOW(), "operatingSince") < INTERVAL '1 year' THEN -4   -- New service penalty
            WHEN AGE(NOW(), "operatingSince") >= INTERVAL '2 years' THEN 5   -- Mature service bonus
            ELSE 0
        END
    INTO operating_since_factor
    FROM "Service"
    WHERE id = service_id;
    
    -- Check for legal registration (country code or company name)
    IF EXISTS (
        SELECT 1 FROM "Service" 
        WHERE id = service_id AND ("registrationCountryCode" IS NOT NULL OR "registeredCompanyName" IS NOT NULL)
    ) THEN
        legally_registered_factor := 2;
    END IF;

    -- Incident penalty (resolution-anchored decay). While ONGOING, full penalty
    -- by severity, flat. Once RESOLVED, it steps down by outcome and decays
    -- linearly to zero over a severity-dependent window measured from resolvedAt.
    -- A manual trustOverride wins when set. Only incidents on a visible,
    -- non-deleted INCIDENT-class event count. Mirrored in src/lib/incidentPenalty.ts.
    SELECT COALESCE(ROUND(SUM(
        CASE
            WHEN i."trustOverride" IS NOT NULL THEN i."trustOverride"
            ELSE
                (CASE i.severity
                    WHEN 'LOW' THEN -5
                    WHEN 'MEDIUM' THEN -12
                    WHEN 'HIGH' THEN -22
                    WHEN 'CRITICAL' THEN -35
                END)::numeric
                * (CASE
                    WHEN i.state <> 'RESOLVED' OR i."resolvedAt" IS NULL THEN 1.0
                    ELSE
                        (CASE COALESCE(i.outcome::text, 'UNKNOWN')
                            WHEN 'FUNDS_RECOVERED' THEN 0.2
                            WHEN 'USERS_REIMBURSED' THEN 0.3
                            WHEN 'PARTIAL' THEN 0.5
                            WHEN 'FUNDS_LOST' THEN 0.75
                            ELSE 0.5
                        END)
                        * GREATEST(0.0, 1.0 - (
                            EXTRACT(EPOCH FROM (NOW() - i."resolvedAt")) / 86400.0
                            / (CASE i.severity
                                WHEN 'LOW' THEN 90
                                WHEN 'MEDIUM' THEN 180
                                WHEN 'HIGH' THEN 365
                                WHEN 'CRITICAL' THEN 540
                            END)
                        ))
                END)
        END
    )), 0)::INT
    INTO incident_penalty_factor
    FROM "Incident" i
    JOIN "Event" e ON e.id = i."eventId"
    WHERE e."serviceId" = service_id
      AND e.visible = TRUE
      AND e."deletedAt" IS NULL
      AND e.class = 'INCIDENT';

    -- Calculate final trust score (base 100)
    trust_score := 50 + verification_factor + attributes_score + recently_approved_factor + tos_penalty_factor + operating_since_factor + legally_registered_factor + incident_penalty_factor;

    -- Ensure the score is in reasonable bounds (0-100)
    trust_score := GREATEST(0, LEAST(100, trust_score));
    
    RETURN trust_score;
END;
$$ LANGUAGE plpgsql;

-- Calculate overall score based on weighted average of privacy and trust scores
CREATE OR REPLACE FUNCTION calculate_overall_score(service_id INT, privacy_score INT, trust_score INT) 
RETURNS INT AS $$
DECLARE
    overall_score INT;
BEGIN
    overall_score := CAST(((privacy_score * 0.6) + (trust_score * 0.4)) / 10.0 AS INT);
    RETURN GREATEST(0, LEAST(10, overall_score));
END;
$$ LANGUAGE plpgsql;

-- Main function to calculate all scores for a service
CREATE OR REPLACE FUNCTION calculate_service_scores() 
RETURNS TRIGGER AS $$
DECLARE
    privacy_score INT;
    trust_score INT;
    overall_score INT;
    service_id INT;
BEGIN
    -- Determine which service ID to use based on the trigger context and table
    IF TG_TABLE_NAME = 'Service' THEN
        IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
            service_id := NEW."id";
        END IF;
    ELSIF TG_TABLE_NAME = 'ServiceAttribute' THEN
        IF TG_OP = 'DELETE' THEN
            service_id := OLD."serviceId";
        ELSE -- INSERT or UPDATE
            service_id := NEW."serviceId";
        END IF;
    ELSIF TG_TABLE_NAME = 'Incident' THEN
        IF TG_OP = 'DELETE' THEN
            SELECT "serviceId" INTO service_id FROM "Event" WHERE id = OLD."eventId";
        ELSE
            SELECT "serviceId" INTO service_id FROM "Event" WHERE id = NEW."eventId";
        END IF;
    ELSIF TG_TABLE_NAME = 'Event' THEN
        IF TG_OP = 'DELETE' THEN
            service_id := OLD."serviceId";
        ELSE
            service_id := NEW."serviceId";
        END IF;
    END IF;

    -- A cascade delete (Event -> Incident) can leave no resolvable service; skip.
    IF service_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Calculate each score
    privacy_score := calculate_privacy_score(service_id);
    trust_score := calculate_trust_score(service_id);
    overall_score := calculate_overall_score(service_id, privacy_score, trust_score);

    -- Cap score if service is flagged as scam (verificationStatus = 'VERIFICATION_FAILED')
    IF (SELECT "verificationStatus" FROM "Service" WHERE "id" = service_id) = 'VERIFICATION_FAILED' THEN
        IF overall_score > 3 THEN
            overall_score := 3;
        ELSIF overall_score < 0 THEN
            overall_score := 0;
        END IF;
    END IF;

    -- Update the service with the new scores
    UPDATE "Service"
    SET 
        "privacyScore" = privacy_score,
        "trustScore" = trust_score,
        "overallScore" = overall_score
    WHERE "id" = service_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to recalculate scores when service is created or updated
CREATE TRIGGER service_score_update_trigger
    AFTER INSERT OR UPDATE
    ON "Service"
    FOR EACH ROW
    WHEN (pg_trigger_depth() < 2)  -- Prevent recursive triggering
    EXECUTE FUNCTION calculate_service_scores();

-- Create trigger to recalculate scores when service attributes change
CREATE TRIGGER service_attribute_change_trigger
    AFTER INSERT OR UPDATE OR DELETE
    ON "ServiceAttribute"
    FOR EACH ROW
    WHEN (pg_trigger_depth() < 2)  -- Prevent recursive triggering
    EXECUTE FUNCTION calculate_service_scores();

-- Recalculate when an incident is added, edited, resolved, or removed.
CREATE TRIGGER incident_score_update_trigger
    AFTER INSERT OR UPDATE OR DELETE
    ON "Incident"
    FOR EACH ROW
    WHEN (pg_trigger_depth() < 2)
    EXECUTE FUNCTION calculate_service_scores();

-- Recalculate when an incident-class event is hidden, restored, or deleted,
-- since that changes which incidents count toward the penalty. Split by op
-- because a WHEN clause cannot reference NEW on DELETE.
CREATE TRIGGER event_incident_update_trigger
    AFTER UPDATE
    ON "Event"
    FOR EACH ROW
    WHEN (pg_trigger_depth() < 2 AND (NEW.class = 'INCIDENT' OR OLD.class = 'INCIDENT'))
    EXECUTE FUNCTION calculate_service_scores();

CREATE TRIGGER event_incident_delete_trigger
    AFTER DELETE
    ON "Event"
    FOR EACH ROW
    WHEN (pg_trigger_depth() < 2 AND OLD.class = 'INCIDENT')
    EXECUTE FUNCTION calculate_service_scores();

-- Function to queue score recalculation for all services with a specific attribute
CREATE OR REPLACE FUNCTION queue_service_score_recalculation_for_attribute()
RETURNS TRIGGER AS $$
DECLARE
    service_rec RECORD;
BEGIN
    -- Only trigger recalculation if relevant fields changed
    IF (TG_OP = 'UPDATE' AND (
        OLD."privacyPoints" != NEW."privacyPoints" OR
        OLD."trustPoints" != NEW."trustPoints" OR
        OLD."type" != NEW."type" OR
        OLD."category" != NEW."category"
    )) THEN
        -- Find all services that have this attribute and queue a recalculation job
        FOR service_rec IN 
            SELECT DISTINCT sa."serviceId" 
            FROM "ServiceAttribute" sa 
            WHERE sa."attributeId" = NEW.id
        LOOP
            -- Insert a job into the queue table
            -- ON CONFLICT clause ensures we don't queue the same service multiple times per transaction
            INSERT INTO "ServiceScoreRecalculationJob" ("serviceId", "createdAt", "processedAt")
            VALUES (service_rec."serviceId", NOW(), NULL)
            ON CONFLICT ("serviceId") DO UPDATE SET "processedAt" = NULL, "createdAt" = NOW();

        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create constraint trigger to queue score recalculation when attributes are updated
DROP TRIGGER IF EXISTS attribute_change_trigger ON "Attribute";
CREATE CONSTRAINT TRIGGER attribute_change_trigger
    AFTER UPDATE
    ON "Attribute"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    WHEN (pg_trigger_depth() < 2)
    EXECUTE FUNCTION queue_service_score_recalculation_for_attribute();
