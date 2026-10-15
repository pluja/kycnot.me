-- Marking a suggestion under review assigns it to that moderator, so two people don't review the same one.
ALTER TABLE "ServiceSuggestion" ADD COLUMN "assignedToId" INTEGER;
ALTER TABLE "ServiceSuggestion" ADD COLUMN "assignedAt" TIMESTAMP(3);

CREATE INDEX "ServiceSuggestion_assignedToId_idx" ON "ServiceSuggestion"("assignedToId");

ALTER TABLE "ServiceSuggestion" ADD CONSTRAINT "ServiceSuggestion_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
