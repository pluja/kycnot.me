ALTER TABLE "Comment" ADD COLUMN "ratingDisabledByModerator" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Comment_ratingDisabledByModerator_idx" ON "Comment"("ratingDisabledByModerator");
