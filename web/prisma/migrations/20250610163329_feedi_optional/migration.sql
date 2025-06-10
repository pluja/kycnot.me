/*
  Warnings:

  - A unique constraint covering the columns `[feedId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "feedId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_feedId_key" ON "User"("feedId");
