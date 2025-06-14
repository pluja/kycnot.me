/*
  Warnings:

  - You are about to drop the column `isRecentlyListed` on the `Service` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Service" DROP COLUMN "isRecentlyListed",
ADD COLUMN     "isRecentlyApproved" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Service_approvedAt_idx" ON "Service"("approvedAt");

-- CreateIndex
CREATE INDEX "Service_verifiedAt_idx" ON "Service"("verifiedAt");

-- CreateIndex
CREATE INDEX "Service_spamAt_idx" ON "Service"("spamAt");

-- CreateIndex
CREATE INDEX "Service_serviceVisibility_idx" ON "Service"("serviceVisibility");
