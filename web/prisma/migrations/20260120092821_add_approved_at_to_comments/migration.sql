-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "approvedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Comment_approvedAt_idx" ON "Comment"("approvedAt");
