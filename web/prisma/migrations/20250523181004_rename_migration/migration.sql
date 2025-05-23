/*
  Manully edited to be a rename migration.
*/
-- AlterEnum
BEGIN;
ALTER TYPE "AccountStatusChange" RENAME VALUE 'VERIFIER_TRUE' TO 'MODERATOR_TRUE';
ALTER TYPE "AccountStatusChange" RENAME VALUE 'VERIFIER_FALSE' TO 'MODERATOR_FALSE';
COMMIT;

-- AlterTable
ALTER TABLE "User" 
RENAME COLUMN "verifier" TO "moderator"

