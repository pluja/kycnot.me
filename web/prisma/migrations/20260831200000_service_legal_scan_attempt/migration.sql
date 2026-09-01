ALTER TABLE "Service" ADD COLUMN     "lastLegalScanAttemptAt" TIMESTAMP(3);

-- Every service scanned so far was stamped whatever the scan concluded, so what
-- that column holds is the last attempt. Copying it keeps the sweep's ordering
-- meaningful from the first run rather than treating every service as untried.
UPDATE "Service" SET "lastLegalScanAttemptAt" = "lastLegalScanAt";
