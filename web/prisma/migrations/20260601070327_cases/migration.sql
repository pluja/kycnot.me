-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('DRAFT', 'OPEN', 'RESOLVED', 'DISPUTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CaseIssueType" AS ENUM ('NON_PAYMENT', 'FROZEN_FUNDS', 'KYC_DEMAND', 'ACCOUNT_CLOSURE', 'UNRESPONSIVE_SUPPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "CaseEvidenceType" AS ENUM ('LETTER_OF_GUARANTEE', 'TRANSACTION_ID', 'COMMUNICATION_LOG', 'SCREENSHOT', 'OTHER');

-- CreateTable
CREATE TABLE "Case" (
    "id" SERIAL NOT NULL,
    "publicId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "issueType" "CaseIssueType" NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'DRAFT',
    "summaryMd" TEXT NOT NULL,
    "amountText" TEXT,
    "externalSource" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionMd" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "serviceId" INTEGER NOT NULL,
    "reportedById" INTEGER,
    "createdById" INTEGER,

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseUpdate" (
    "id" SERIAL NOT NULL,
    "bodyMd" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "caseId" INTEGER NOT NULL,
    "authorId" INTEGER,

    CONSTRAINT "CaseUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseEvidence" (
    "id" SERIAL NOT NULL,
    "type" "CaseEvidenceType" NOT NULL,
    "description" TEXT,
    "bodyMd" TEXT,
    "imageUrl" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "caseId" INTEGER NOT NULL,
    "caseUpdateId" INTEGER,

    CONSTRAINT "CaseEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Case_publicId_key" ON "Case"("publicId");

-- CreateIndex
CREATE INDEX "Case_serviceId_idx" ON "Case"("serviceId");

-- CreateIndex
CREATE INDEX "Case_status_idx" ON "Case"("status");

-- CreateIndex
CREATE INDEX "Case_createdAt_idx" ON "Case"("createdAt");

-- CreateIndex
CREATE INDEX "CaseUpdate_caseId_idx" ON "CaseUpdate"("caseId");

-- CreateIndex
CREATE INDEX "CaseUpdate_createdAt_idx" ON "CaseUpdate"("createdAt");

-- CreateIndex
CREATE INDEX "CaseEvidence_caseId_idx" ON "CaseEvidence"("caseId");

-- CreateIndex
CREATE INDEX "CaseEvidence_caseUpdateId_idx" ON "CaseEvidence"("caseUpdateId");

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseUpdate" ADD CONSTRAINT "CaseUpdate_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseUpdate" ADD CONSTRAINT "CaseUpdate_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseEvidence" ADD CONSTRAINT "CaseEvidence_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseEvidence" ADD CONSTRAINT "CaseEvidence_caseUpdateId_fkey" FOREIGN KEY ("caseUpdateId") REFERENCES "CaseUpdate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
