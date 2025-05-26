-- CreateTable
CREATE TABLE "InternalServiceNote" (
    "id" SERIAL NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "serviceId" INTEGER NOT NULL,
    "addedByUserId" INTEGER,

    CONSTRAINT "InternalServiceNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InternalServiceNote_serviceId_idx" ON "InternalServiceNote"("serviceId");

-- CreateIndex
CREATE INDEX "InternalServiceNote_addedByUserId_idx" ON "InternalServiceNote"("addedByUserId");

-- CreateIndex
CREATE INDEX "InternalServiceNote_createdAt_idx" ON "InternalServiceNote"("createdAt");

-- AddForeignKey
ALTER TABLE "InternalServiceNote" ADD CONSTRAINT "InternalServiceNote_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalServiceNote" ADD CONSTRAINT "InternalServiceNote_addedByUserId_fkey" FOREIGN KEY ("addedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
