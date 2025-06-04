/*
  Warnings:

  - You are about to drop the column `kycLevelDetailsId` on the `Service` table. All the data in the column will be lost.
  - Made the column `kycLevelClarification` on table `Service` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Service" DROP COLUMN "kycLevelDetailsId",
ALTER COLUMN "kycLevelClarification" SET NOT NULL,
ALTER COLUMN "kycLevelClarification" SET DEFAULT 'NONE';
