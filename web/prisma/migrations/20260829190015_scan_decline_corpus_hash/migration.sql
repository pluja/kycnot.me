-- AlterTable
ALTER TABLE "ServiceScanDecline" ADD COLUMN     "corpusHash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ServiceScanDecline" ALTER COLUMN "corpusHash" DROP DEFAULT;
