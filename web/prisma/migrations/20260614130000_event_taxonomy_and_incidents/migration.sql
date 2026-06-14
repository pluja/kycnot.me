-- CreateEnum
CREATE TYPE "EventClass" AS ENUM ('CHANGE', 'EVENT', 'INCIDENT');
CREATE TYPE "EventSentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');
CREATE TYPE "IncidentType" AS ENUM ('EXPLOIT', 'CUSTODIAL_HACK', 'DATA_BREACH', 'MASS_FROZEN_FUNDS', 'INSOLVENCY', 'OTHER');
CREATE TYPE "IncidentSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "IncidentState" AS ENUM ('ONGOING', 'RESOLVED');
CREATE TYPE "IncidentOutcome" AS ENUM ('FUNDS_RECOVERED', 'USERS_REIMBURSED', 'PARTIAL', 'FUNDS_LOST', 'UNKNOWN');

-- AlterTable
ALTER TABLE "Event"
  ADD COLUMN "class" "EventClass" NOT NULL DEFAULT 'EVENT',
  ADD COLUMN "sentiment" "EventSentiment" NOT NULL DEFAULT 'NEUTRAL';

-- Backfill the new taxonomy from the legacy `type`. Auto-recorded edits become
-- CHANGE; the rest stay EVENT with a sentiment. ALERT/WARNING are NOT auto-promoted
-- to INCIDENT: that requires human triage (many are reputational, not security).
UPDATE "Event" SET "class" = 'CHANGE' WHERE "type" = 'UPDATE';
UPDATE "Event" SET "sentiment" = 'POSITIVE' WHERE "type" = 'NORMAL';
UPDATE "Event" SET "sentiment" = 'NEGATIVE' WHERE "type" IN ('WARNING', 'WARNING_SOLVED', 'ALERT', 'ALERT_SOLVED');

-- CreateTable
CREATE TABLE "Incident" (
    "id" SERIAL NOT NULL,
    "eventId" INTEGER NOT NULL,
    "type" "IncidentType" NOT NULL DEFAULT 'OTHER',
    "severity" "IncidentSeverity" NOT NULL,
    "state" "IncidentState" NOT NULL DEFAULT 'ONGOING',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "outcome" "IncidentOutcome",
    "amountText" TEXT,
    "trustOverride" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Incident_eventId_key" ON "Incident"("eventId");
CREATE INDEX "Incident_state_idx" ON "Incident"("state");
CREATE INDEX "Incident_severity_idx" ON "Incident"("severity");
CREATE INDEX "Event_class_idx" ON "Event"("class");

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
