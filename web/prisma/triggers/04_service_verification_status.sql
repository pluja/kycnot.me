CREATE OR REPLACE FUNCTION manage_service_visibility_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."serviceVisibility" = 'PUBLIC' OR NEW."serviceVisibility" = 'ARCHIVED' THEN
    IF NEW."listedAt" IS NULL THEN
      NEW."listedAt" := NOW();
    END IF;
  ELSE
    NEW."listedAt" := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Timestamps follow status changes only: saving a service without changing its status keeps them.
CREATE OR REPLACE FUNCTION manage_service_verification_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."verificationStatus" IS NOT DISTINCT FROM NEW."verificationStatus" THEN
    RETURN NEW;
  END IF;

  IF NEW."verificationStatus" = 'APPROVED' OR NEW."verificationStatus" = 'VERIFICATION_SUCCESS' THEN
    IF NEW."approvedAt" IS NULL THEN
      NEW."approvedAt" := NOW();
      NEW."isRecentlyApproved" := TRUE;
    END IF;
  ELSE
    NEW."approvedAt" := NULL;
    NEW."isRecentlyApproved" := FALSE;
  END IF;

  NEW."verifiedAt" := CASE WHEN NEW."verificationStatus" = 'VERIFICATION_SUCCESS' THEN NOW() END;
  NEW."spamAt" := CASE WHEN NEW."verificationStatus" = 'VERIFICATION_FAILED' THEN NOW() END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop the old triggers TODO: remove this some day
DROP TRIGGER IF EXISTS trigger_set_service_listed_at ON "Service";
DROP TRIGGER IF EXISTS trigger_manage_service_timestamps ON "Service";
DROP FUNCTION IF EXISTS manage_service_timestamps();

DROP TRIGGER IF EXISTS trigger_manage_service_visibility_timestamps ON "Service";
DROP TRIGGER IF EXISTS trigger_manage_service_verification_timestamps ON "Service";

CREATE TRIGGER trigger_manage_service_visibility_timestamps
BEFORE INSERT OR UPDATE OF "serviceVisibility" ON "Service"
FOR EACH ROW
EXECUTE FUNCTION manage_service_visibility_timestamps();

CREATE TRIGGER trigger_manage_service_verification_timestamps
BEFORE INSERT OR UPDATE OF "verificationStatus" ON "Service"
FOR EACH ROW
EXECUTE FUNCTION manage_service_verification_timestamps();
