-- AlterTable
ALTER TABLE "Service" DROP COLUMN "serviceInfoBanner";
ALTER TABLE "Service" DROP COLUMN "serviceInfoBannerNotes";

-- DropEnum
DROP TYPE "ServiceInfoBanner";
