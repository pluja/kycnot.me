-- AlterTable
ALTER TABLE "ServiceLegalDocument" ADD COLUMN     "ignoredAt" TIMESTAMP(3),
ADD COLUMN     "removedAt" TIMESTAMP(3),
ADD COLUMN     "unreachableAt" TIMESTAMP(3);
