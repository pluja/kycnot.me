-- Align the DB column with Prisma's non-null String[] @default([]) model.
-- Prisma emitted the column without NOT NULL; a NULL is only reachable via raw
-- SQL, but the constraint makes the model and trigger predicates NULL-safe.
UPDATE "User" SET "capabilities" = ARRAY[]::TEXT[] WHERE "capabilities" IS NULL;
ALTER TABLE "User" ALTER COLUMN "capabilities" SET NOT NULL;
