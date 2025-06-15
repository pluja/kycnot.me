/*
  Warnings:

  - You are about to drop the column `userAgent` on the `PushSubscription` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "PushSubscription" DROP COLUMN "userAgent";
