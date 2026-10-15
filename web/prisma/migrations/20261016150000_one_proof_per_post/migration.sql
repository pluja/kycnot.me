-- A post keeps one live proof. Where an import left several, the kept one is proof that counts (strongest
-- result first), then unchecked proof, then proof a check did not count, newest first within each. Text or an
-- image it lacks moves in from another unchecked or counting proof, and it then waits for a new check. Proof a
-- check did not count gives nothing. The others are removed, which wipes them and queues their files; their check
-- records stay. prisma/triggers/21_one_live_proof.sql then enforces one live proof per post.
CREATE TEMP TABLE proof_rank ON COMMIT DROP AS
WITH live AS (
  SELECT e.id, e."commentId", e.body, e."imagePath", e."normalizedId", e.kind, e."formatValid", e."createdAt",
    (SELECT ch.finding FROM "EvidenceCheck" ch WHERE ch."evidenceId" = e.id
      ORDER BY ch."recordedAt" DESC, ch.id DESC LIMIT 1) AS finding,
    (SELECT CASE WHEN ch.finding = 'LEGACY' THEN e."legacyStatus" IS NOT DISTINCT FROM 'APPROVED'
        ELSE ch.finding IN ('ORDER_FOUND', 'SCREENSHOT_REVIEWED', 'TRANSACTION_SUPPORTED', 'REFUND_SUPPORTED') END
      FROM "EvidenceCheck" ch WHERE ch."evidenceId" = e.id ORDER BY ch."recordedAt" DESC, ch.id DESC LIMIT 1
    ) AS counts
  FROM "CommentEvidence" e
  WHERE e."removedAt" IS NULL AND e."commentId" IS NOT NULL
    AND e."commentId" IN (
      SELECT "commentId" FROM "CommentEvidence" WHERE "removedAt" IS NULL AND "commentId" IS NOT NULL
      GROUP BY "commentId" HAVING count(*) > 1
    )
)
SELECT live.*, row_number() OVER (
  PARTITION BY "commentId"
  ORDER BY CASE WHEN counts THEN 0 WHEN counts IS NULL THEN 1 ELSE 2 END,
    array_position(ARRAY['ORDER_FOUND', 'TRANSACTION_SUPPORTED', 'REFUND_SUPPORTED', 'SCREENSHOT_REVIEWED', 'LEGACY'], finding::text),
    "createdAt" DESC, id DESC
) AS rank
FROM live;

CREATE TEMP TABLE proof_donor ON COMMIT DROP AS
SELECT keep.id AS "keepId",
  (SELECT d.id FROM proof_rank d WHERE d."commentId" = keep."commentId" AND d.rank > 1 AND d.counts IS NOT FALSE
     AND d.body IS NOT NULL AND keep.body IS NULL ORDER BY d.rank LIMIT 1) AS "bodyFrom",
  (SELECT d.id FROM proof_rank d WHERE d."commentId" = keep."commentId" AND d.rank > 1 AND d.counts IS NOT FALSE
     AND d."imagePath" IS NOT NULL AND keep."imagePath" IS NULL ORDER BY d.rank LIMIT 1) AS "imageFrom"
FROM proof_rank keep
WHERE keep.rank = 1;

-- Only the image that moves leaves its row first, so the unique path holds and every other image is queued for
-- cleanup when its row is removed below.
UPDATE "CommentEvidence" e SET "imagePath" = NULL
FROM proof_donor d WHERE e.id = d."imageFrom";

UPDATE "CommentEvidence" e SET
  body = COALESCE(e.body, body_donor.body),
  "normalizedId" = COALESCE(e."normalizedId", body_donor."normalizedId"),
  kind = CASE WHEN body_donor.id IS NOT NULL THEN body_donor.kind ELSE e.kind END,
  "formatValid" = CASE WHEN body_donor.id IS NOT NULL THEN body_donor."formatValid" ELSE e."formatValid" END,
  "imagePath" = COALESCE(e."imagePath", image_donor."imagePath"),
  "needsCheck" = true
FROM proof_donor d
LEFT JOIN proof_rank body_donor ON body_donor.id = d."bodyFrom"
LEFT JOIN proof_rank image_donor ON image_donor.id = d."imageFrom"
WHERE e.id = d."keepId" AND (d."bodyFrom" IS NOT NULL OR d."imageFrom" IS NOT NULL);

UPDATE "CommentEvidence" e SET "removedAt" = NOW()
FROM proof_rank r WHERE e.id = r.id AND r.rank > 1;
