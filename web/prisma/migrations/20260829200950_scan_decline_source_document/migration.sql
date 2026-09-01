-- Declines were scoped to the whole corpus, which any edit to any page expired.
-- No production rows exist yet, so the column is replaced rather than migrated.
ALTER TABLE "ServiceScanDecline" DROP COLUMN "corpusHash";
ALTER TABLE "ServiceScanDecline" ADD COLUMN     "sourceUrlKey" TEXT;
ALTER TABLE "ServiceScanDecline" ADD COLUMN     "sourceContentHash" TEXT;
