WITH latest_active_rating AS (
    SELECT DISTINCT ON ("authorId", "serviceId") id, "authorId", "serviceId"
    FROM "Comment"
    WHERE rating IS NOT NULL
    AND "parentId" IS NULL
    AND "ratingActive" = true
    ORDER BY "authorId", "serviceId", "createdAt" DESC, id DESC
)
UPDATE "Comment" c
SET "ratingActive" = false
FROM latest_active_rating latest
WHERE c."authorId" = latest."authorId"
AND c."serviceId" = latest."serviceId"
AND c.rating IS NOT NULL
AND c."parentId" IS NULL
AND c."ratingActive" = true
AND c.id <> latest.id;
