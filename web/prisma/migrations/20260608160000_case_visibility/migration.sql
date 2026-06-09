-- Unify evidence/update visibility into a single three-tier enum.
CREATE TYPE "CaseVisibility" AS ENUM ('PUBLIC', 'PARTICIPANTS', 'STAFF');

-- CaseUpdate: staffOnly -> visibility
ALTER TABLE "CaseUpdate" ADD COLUMN "visibility" "CaseVisibility" NOT NULL DEFAULT 'PARTICIPANTS';
UPDATE "CaseUpdate" SET "visibility" = 'STAFF' WHERE "staffOnly" = true;
ALTER TABLE "CaseUpdate" DROP COLUMN "staffOnly";

-- CaseEvidence: isPublic -> visibility
ALTER TABLE "CaseEvidence" ADD COLUMN "visibility" "CaseVisibility" NOT NULL DEFAULT 'PARTICIPANTS';
UPDATE "CaseEvidence" SET "visibility" = 'PUBLIC' WHERE "isPublic" = true;
ALTER TABLE "CaseEvidence" DROP COLUMN "isPublic";
