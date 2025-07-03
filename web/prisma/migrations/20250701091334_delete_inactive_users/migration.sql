-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'ACCOUNT_DELETION_WARNING_30_DAYS';
ALTER TYPE "NotificationType" ADD VALUE 'ACCOUNT_DELETION_WARNING_15_DAYS';
ALTER TYPE "NotificationType" ADD VALUE 'ACCOUNT_DELETION_WARNING_5_DAYS';
ALTER TYPE "NotificationType" ADD VALUE 'ACCOUNT_DELETION_WARNING_1_DAY';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "scheduledDeletionAt" DATE;
