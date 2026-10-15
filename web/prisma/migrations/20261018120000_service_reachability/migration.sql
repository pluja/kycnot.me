-- The suggestion cleanup records failed reachability checks, so a site counts as dead only after repeated failures.
ALTER TABLE "Service" ADD COLUMN "unreachableChecks" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Service" ADD COLUMN "reachabilityCheckedAt" TIMESTAMP(3);
