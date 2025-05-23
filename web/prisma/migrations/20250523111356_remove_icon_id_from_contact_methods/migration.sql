/*
  Warnings:

  - You are about to drop the column `iconId` on the `ServiceContactMethod` table. All the data in the column will be lost.
  - You are about to drop the column `info` on the `ServiceContactMethod` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ServiceContactMethod" DROP COLUMN "iconId",
DROP COLUMN "info",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "label" DROP NOT NULL;
