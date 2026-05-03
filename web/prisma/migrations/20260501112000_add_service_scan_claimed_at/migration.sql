-- AlterTable
ALTER TABLE "ServiceScanJob" ADD COLUMN IF NOT EXISTS "claimedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ServiceScanJob_claimedAt_idx" ON "ServiceScanJob"("claimedAt");
