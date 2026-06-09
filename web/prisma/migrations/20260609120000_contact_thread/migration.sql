-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('AWAITING_STAFF', 'AWAITING_USER', 'RESOLVED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'CONTACT_MESSAGE';

-- DropTable
-- Existing contact messages are exported manually beforehand; this is a clean
-- wipe to the new thread model (the old single-message shape is incompatible).
DROP TABLE "ContactMessage";

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "aboutContactMessageId" INTEGER,
ADD COLUMN     "aboutContactThreadId" INTEGER;

-- CreateTable
CREATE TABLE "ContactThread" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "category" "ContactCategory" NOT NULL,
    "status" "ContactStatus" NOT NULL DEFAULT 'AWAITING_STAFF',
    "readAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "adminNote" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorId" INTEGER,

    CONSTRAINT "ContactThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactMessage" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fromStaff" BOOLEAN NOT NULL DEFAULT false,
    "content" TEXT NOT NULL,
    "threadId" INTEGER NOT NULL,
    "authorId" INTEGER,

    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactThread_authorId_idx" ON "ContactThread"("authorId");

-- CreateIndex
CREATE INDEX "ContactThread_status_idx" ON "ContactThread"("status");

-- CreateIndex
CREATE INDEX "ContactThread_lastMessageAt_idx" ON "ContactThread"("lastMessageAt");

-- CreateIndex
CREATE INDEX "ContactThread_resolvedAt_idx" ON "ContactThread"("resolvedAt");

-- CreateIndex
CREATE INDEX "ContactThread_readAt_idx" ON "ContactThread"("readAt");

-- CreateIndex
CREATE INDEX "ContactMessage_threadId_idx" ON "ContactMessage"("threadId");

-- CreateIndex
CREATE INDEX "ContactMessage_createdAt_idx" ON "ContactMessage"("createdAt");

-- CreateIndex
CREATE INDEX "ContactMessage_authorId_idx" ON "ContactMessage"("authorId");

-- CreateIndex
CREATE INDEX "idx_notification_contact_message" ON "Notification"("userId", "type", "aboutContactMessageId");

-- AddForeignKey
ALTER TABLE "ContactThread" ADD CONSTRAINT "ContactThread_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactMessage" ADD CONSTRAINT "ContactMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ContactThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactMessage" ADD CONSTRAINT "ContactMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_aboutContactThreadId_fkey" FOREIGN KEY ("aboutContactThreadId") REFERENCES "ContactThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_aboutContactMessageId_fkey" FOREIGN KEY ("aboutContactMessageId") REFERENCES "ContactMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
