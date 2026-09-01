-- CreateTable
CREATE TABLE "ServiceScanDecline" (
    "id" SERIAL NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "declinedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceScanDecline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceScanDecline_serviceId_idx" ON "ServiceScanDecline"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceScanDecline_serviceId_fingerprint_key" ON "ServiceScanDecline"("serviceId", "fingerprint");

-- AddForeignKey
ALTER TABLE "ServiceScanDecline" ADD CONSTRAINT "ServiceScanDecline_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceScanDecline" ADD CONSTRAINT "ServiceScanDecline_declinedById_fkey" FOREIGN KEY ("declinedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
