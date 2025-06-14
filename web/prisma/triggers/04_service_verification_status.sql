CREATE OR REPLACE FUNCTION manage_service_visibility_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."serviceVisibility" = 'PUBLIC' OR NEW."serviceVisibility" = 'ARCHIVED' THEN
    IF OLD."listedAt" IS NULL THEN
      NEW."listedAt" := NOW();
    END IF;
  ELSE
    NEW."listedAt" := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION manage_service_verification_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW."verificationStatus" = 'APPROVED' OR NEW."verificationStatus" = 'VERIFICATION_SUCCESS') THEN
    IF OLD."approvedAt" IS NULL THEN
      NEW."approvedAt" := NOW();
      NEW."isRecentlyApproved" := TRUE;
    END IF;
  ELSE
    NEW."approvedAt" := NULL;
    NEW."isRecentlyApproved" := FALSE;
  END IF;

  IF NEW."verificationStatus" = 'VERIFICATION_SUCCESS' THEN
    NEW."verifiedAt" := NOW();
  ELSE
    NEW."verifiedAt" := NULL;
  END IF;

  IF NEW."verificationStatus" = 'VERIFICATION_FAILED' THEN
    NEW."spamAt" := NOW();
  ELSE
    NEW."spamAt" := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop the old triggers TODO: remove this some day
DROP TRIGGER IF EXISTS trigger_set_service_listed_at ON "Service";
DROP TRIGGER IF EXISTS trigger_manage_service_timestamps ON "Service";

DROP TRIGGER IF EXISTS trigger_manage_service_visibility_timestamps ON "Service";
DROP TRIGGER IF EXISTS trigger_manage_service_verification_timestamps ON "Service";

CREATE TRIGGER trigger_manage_service_visibility_timestamps
BEFORE UPDATE OF "serviceVisibility" ON "Service"
FOR EACH ROW
EXECUTE FUNCTION manage_service_visibility_timestamps();

CREATE TRIGGER trigger_manage_service_verification_timestamps
BEFORE UPDATE OF "verificationStatus" ON "Service"
FOR EACH ROW
EXECUTE FUNCTION manage_service_verification_timestamps();
