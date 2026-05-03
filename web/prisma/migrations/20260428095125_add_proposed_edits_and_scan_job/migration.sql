-- AlterTable
ALTER TABLE "ServiceSuggestion" ADD COLUMN     "proposedEdits" JSONB;

-- CreateTable
CREATE TABLE "ServiceScanJob" (
    "id" SERIAL NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "requestedByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "ServiceScanJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceScanJob_serviceId_key" ON "ServiceScanJob"("serviceId");

-- CreateIndex
CREATE INDEX "ServiceScanJob_processedAt_idx" ON "ServiceScanJob"("processedAt");

-- CreateIndex
CREATE INDEX "ServiceScanJob_createdAt_idx" ON "ServiceScanJob"("createdAt");
