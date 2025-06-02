-- CreateEnum
CREATE TYPE "KycLevelClarification" AS ENUM ('NONE', 'DEPENDS_ON_PARTNERS');

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "kycLevelClarification" "KycLevelClarification",
ADD COLUMN     "kycLevelDetailsId" INTEGER;
