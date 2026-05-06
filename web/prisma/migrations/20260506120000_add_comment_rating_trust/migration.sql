ALTER TABLE "Comment" ADD COLUMN "ratingTrustLabel" TEXT,
ADD COLUMN "ratingTrustReason" TEXT,
ADD COLUMN "ratingWeight" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "Service" ADD COLUMN "trustWeightedUserRating" DOUBLE PRECISION,
ADD COLUMN "trustedUserRatingCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "userRatingCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "userRatingWeight" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE INDEX "Comment_ratingWeight_idx" ON "Comment"("ratingWeight");
CREATE INDEX "Service_trustWeightedUserRating_idx" ON "Service"("trustWeightedUserRating");
CREATE INDEX "Service_userRatingCount_idx" ON "Service"("userRatingCount");
CREATE INDEX "Service_trustedUserRatingCount_idx" ON "Service"("trustedUserRatingCount");
