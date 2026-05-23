-- CreateEnum
CREATE TYPE "ContactCategory" AS ENUM ('ACCOUNT_VERIFICATION', 'SERVICE_REPORT_URGENT', 'BUG', 'OTHER');

-- CreateTable
CREATE TABLE "ContactMessage" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "category" "ContactCategory" NOT NULL,
    "message" TEXT NOT NULL,
    "replyEmail" TEXT,
    "readAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "adminNote" TEXT,
    "authorId" INTEGER,
    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactMessage_createdAt_idx" ON "ContactMessage" ("createdAt");
CREATE INDEX "ContactMessage_readAt_idx" ON "ContactMessage" ("readAt");
CREATE INDEX "ContactMessage_authorId_idx" ON "ContactMessage" ("authorId");

-- AddForeignKey
ALTER TABLE "ContactMessage" ADD CONSTRAINT "ContactMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
