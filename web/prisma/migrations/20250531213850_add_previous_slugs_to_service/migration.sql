-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "previousSlugs" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "Service_previousSlugs_idx" ON "Service"("previousSlugs");
