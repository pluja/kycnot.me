-- CreateEnum
CREATE TYPE "EventOrigin" AS ENUM ('STAFF', 'USER', 'AI', 'MONITOR');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "origin" "EventOrigin" NOT NULL DEFAULT 'STAFF';

-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "incidentId" INTEGER;

-- CreateIndex
CREATE INDEX "Case_incidentId_idx" ON "Case"("incidentId");

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "occurredAt" TIMESTAMP(3),
ADD COLUMN     "publishedAt" TIMESTAMP(3);

-- Backfill: only statuses the app treats as published get a stamp, so no
-- rejected report can ever look like it went public.
UPDATE "Case" SET "publishedAt" = "createdAt" WHERE "status" NOT IN ('DRAFT', 'REJECTED');

-- The event trigger predates the class + sentiment taxonomy and kept writing the
-- default class, so listing edits recorded since then are mislabelled as curated
-- events. 05_service_events.sql now sets both columns for new rows.
UPDATE "Event" SET "class" = 'CHANGE' WHERE "type" = 'UPDATE' AND "class" = 'EVENT';
UPDATE "Event" SET "origin" = 'MONITOR' WHERE "type" = 'UPDATE';

-- CreateIndex
CREATE INDEX "Case_publishedAt_idx" ON "Case"("publishedAt");
