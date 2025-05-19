-- This script manages the  `listedAt`, `verifiedAt`, and `isRecentlyListed` timestamps 
-- for services based on changes to their `verificationStatus`. It ensures these timestamps 
-- are set or cleared appropriately when a service's verification status is updated.

CREATE OR REPLACE FUNCTION manage_service_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  -- Manage listedAt timestamp
  IF NEW."verificationStatus" IN ('APPROVED', 'VERIFICATION_SUCCESS') THEN
    -- Set listedAt only on the first time status becomes APPROVED or VERIFICATION_SUCCESS
    IF OLD."listedAt" IS NULL THEN
      NEW."listedAt" := NOW();
      NEW."isRecentlyListed" := TRUE;
    END IF;
  ELSIF OLD."verificationStatus" IN ('APPROVED', 'VERIFICATION_SUCCESS') THEN
    -- Clear listedAt if the status changes FROM APPROVED or VERIFICATION_SUCCESS to something else
    -- The trigger's WHEN clause ensures NEW."verificationStatus" is different.
    NEW."listedAt" := NULL;
    NEW."isRecentlyListed" := FALSE;
  END IF;

  -- Manage verifiedAt timestamp
  IF NEW."verificationStatus" = 'VERIFICATION_SUCCESS' THEN
    -- Set verifiedAt when status changes TO VERIFICATION_SUCCESS
    NEW."verifiedAt" := NOW();
    NEW."isRecentlyListed" := FALSE;
  ELSIF OLD."verificationStatus" = 'VERIFICATION_SUCCESS' THEN
    -- Clear verifiedAt when status changes FROM VERIFICATION_SUCCESS
    -- The trigger's WHEN clause ensures NEW."verificationStatus" is different.
    NEW."verifiedAt" := NULL;
    NEW."isRecentlyListed" := FALSE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop the old trigger first if it exists under the old name
DROP TRIGGER IF EXISTS trigger_set_service_listed_at ON "Service";
-- Drop the trigger if it exists under the new name
DROP TRIGGER IF EXISTS trigger_manage_service_timestamps ON "Service";

CREATE TRIGGER trigger_manage_service_timestamps
BEFORE UPDATE OF "verificationStatus" ON "Service"
FOR EACH ROW
-- Only execute the function if the verificationStatus value has actually changed
WHEN (OLD."verificationStatus" IS DISTINCT FROM NEW."verificationStatus")
EXECUTE FUNCTION manage_service_timestamps();
