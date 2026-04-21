-- AlterEnum
ALTER TYPE "AttributeCategory" ADD VALUE 'KYC';

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "kycPolicyMd" TEXT;
