-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'EXPERIENCE_RESOLVED_BY_MODERATORS';

-- AlterTable
ALTER TABLE "CommentExperience" ADD COLUMN     "moderatorResolutionNote" VARCHAR(500),
ADD COLUMN     "moderatorResolvedAt" TIMESTAMP(3),
ADD COLUMN     "moderatorResolvedById" INTEGER;

-- AddForeignKey
ALTER TABLE "CommentExperience" ADD CONSTRAINT "CommentExperience_moderatorResolvedById_fkey" FOREIGN KEY ("moderatorResolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
