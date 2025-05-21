-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'KARMA_CHANGE';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "aboutKarmaTransactionId" INTEGER;

-- AlterTable
ALTER TABLE "NotificationPreferences" ADD COLUMN     "karmaNotificationThreshold" INTEGER NOT NULL DEFAULT 10;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_aboutKarmaTransactionId_fkey" FOREIGN KEY ("aboutKarmaTransactionId") REFERENCES "KarmaTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
