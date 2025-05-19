/*
  Warnings:

  - Changed the type of `action` on the `KarmaTransaction` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "KarmaTransactionAction" AS ENUM ('COMMENT_APPROVED', 'COMMENT_VERIFIED', 'COMMENT_SPAM', 'COMMENT_SPAM_REVERTED', 'COMMENT_UPVOTE', 'COMMENT_DOWNVOTE', 'COMMENT_VOTE_REMOVED', 'SUGGESTION_APPROVED', 'MANUAL_ADJUSTMENT');

-- AlterTable
ALTER TABLE "KarmaTransaction" ADD COLUMN     "grantedByUserId" INTEGER,
DROP COLUMN "action",
ADD COLUMN     "action" "KarmaTransactionAction" NOT NULL;

-- CreateIndex
CREATE INDEX "KarmaTransaction_grantedByUserId_idx" ON "KarmaTransaction"("grantedByUserId");

-- AddForeignKey
ALTER TABLE "KarmaTransaction" ADD CONSTRAINT "KarmaTransaction_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
