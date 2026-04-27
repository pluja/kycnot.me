-- CreateTable
CREATE TABLE "Stat" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "dimensionKey" TEXT NOT NULL,
    "serviceId" INTEGER,
    "fromCurrency" TEXT,
    "toCurrency" TEXT,
    "refCode" TEXT,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Stat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Stat_kind_day_dimensionKey_key" ON "Stat"("kind", "day", "dimensionKey");

-- CreateIndex
CREATE INDEX "Stat_kind_day_idx" ON "Stat"("kind", "day");

-- CreateIndex
CREATE INDEX "Stat_serviceId_day_idx" ON "Stat"("serviceId", "day");

-- AddForeignKey
ALTER TABLE "Stat" ADD CONSTRAINT "Stat_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
