-- AlterTable
ALTER TABLE "User" ADD COLUMN     "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[];
