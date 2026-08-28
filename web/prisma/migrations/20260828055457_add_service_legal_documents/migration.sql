-- CreateEnum
CREATE TYPE "LegalDocumentKind" AS ENUM ('TERMS', 'PRIVACY', 'AML', 'REFUND', 'OTHER');

-- CreateEnum
CREATE TYPE "LegalChangeLevel" AS ENUM ('MINOR', 'MATERIAL');

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "tosChangedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ServiceLegalDocument" (
    "id" SERIAL NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "urlKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" "LegalDocumentKind" NOT NULL DEFAULT 'OTHER',
    "contentHash" TEXT NOT NULL,
    "normalizedText" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceLegalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceLegalRevision" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "changeLevel" "LegalChangeLevel" NOT NULL,
    "changedWords" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "diff" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceLegalRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceLegalDocument_serviceId_idx" ON "ServiceLegalDocument"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceLegalDocument_serviceId_urlKey_key" ON "ServiceLegalDocument"("serviceId", "urlKey");

-- CreateIndex
CREATE INDEX "ServiceLegalRevision_serviceId_createdAt_idx" ON "ServiceLegalRevision"("serviceId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceLegalRevision_documentId_createdAt_idx" ON "ServiceLegalRevision"("documentId", "createdAt");

-- AddForeignKey
ALTER TABLE "ServiceLegalDocument" ADD CONSTRAINT "ServiceLegalDocument_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceLegalRevision" ADD CONSTRAINT "ServiceLegalRevision_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ServiceLegalDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceLegalRevision" ADD CONSTRAINT "ServiceLegalRevision_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

