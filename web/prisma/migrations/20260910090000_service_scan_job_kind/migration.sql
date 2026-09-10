-- CreateEnum
CREATE TYPE "ServiceScanJobKind" AS ENUM ('DEEP_SCAN', 'DESCRIPTION');

-- AlterTable
ALTER TABLE "ServiceScanJob" ADD COLUMN "kind" "ServiceScanJobKind" NOT NULL DEFAULT 'DEEP_SCAN';

-- DropIndex
DROP INDEX "ServiceScanJob_serviceId_key";

-- CreateIndex
CREATE UNIQUE INDEX "ServiceScanJob_serviceId_kind_key" ON "ServiceScanJob"("serviceId", "kind");
