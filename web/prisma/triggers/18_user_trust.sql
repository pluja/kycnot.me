-- comment_has_accepted_proof mirrors proofStatus in web/src/lib/proofEvidence.ts: evidence counts only
-- through its latest check, and that check has to confirm it.
CREATE OR REPLACE FUNCTION comment_has_accepted_proof(p_comment_id INT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM "CommentEvidence" e
    WHERE e."commentId" = p_comment_id AND e."removedAt" IS NULL
      AND COALESCE((
        SELECT CASE
          WHEN k.finding = 'LEGACY' THEN e."legacyStatus" IS NOT DISTINCT FROM 'APPROVED'
          ELSE k.finding::text IN ('ORDER_FOUND', 'SCREENSHOT_REVIEWED', 'TRANSACTION_SUPPORTED', 'REFUND_SUPPORTED', 'CLAIM_SUPPORTED')
        END
        FROM "EvidenceCheck" k WHERE k."evidenceId" = e.id ORDER BY k."recordedAt" DESC, k.id DESC LIMIT 1
      ), false)
  );
$$ LANGUAGE sql STABLE;

-- user_trust returns the facts that unlock features, and the two penalties.
-- A rejection counts under the rule a moderator gave, else the AI's rule, else as spam when the AI
-- called it spam. Rejections with none of these count for nothing. The penalizing rules mirror
-- `penalizes` in web/src/constants/commentRules.ts.
CREATE OR REPLACE FUNCTION user_trust(p_user_ids INT[])
RETURNS TABLE (
  "userId" INT,
  "publishedPosts" INT,
  "checkedProofPosts" INT,
  "approvedSuggestions" INT,
  "penalizingRejections" INT,
  "spamRejections" INT,
  untrusted BOOLEAN,
  "commentsDisabled" BOOLEAN
) AS $$
  WITH posts AS (
    SELECT c."authorId" AS user_id,
      COUNT(*)::INT AS published,
      COUNT(*) FILTER (WHERE comment_has_accepted_proof(c.id))::INT AS with_proof
    FROM "Comment" c
    WHERE c."authorId" = ANY(p_user_ids) AND c.status = 'APPROVED' AND c."parentId" IS NULL
    GROUP BY c."authorId"
  ),
  suggestions AS (
    SELECT s."userId" AS user_id, COUNT(*)::INT AS approved
    FROM "ServiceSuggestion" s
    WHERE s."userId" = ANY(p_user_ids) AND s.status = 'APPROVED'
      AND NOT EXISTS (SELECT 1 FROM "ServiceUser" su WHERE su."userId" = s."userId" AND su."serviceId" = s."serviceId")
    GROUP BY s."userId"
  ),
  rejections AS (
    SELECT c."authorId" AS user_id,
      CASE
        WHEN c."humanDecisionReason" IS NOT NULL THEN c."humanDecisionReason"::TEXT
        WHEN c."aiDecisionReason" IS NOT NULL THEN c."aiDecisionReason"::TEXT
        WHEN c."aiIsSpam" THEN 'SPAM'
      END AS rule,
      CASE WHEN c."humanDecisionReason" IS NOT NULL THEN c."humanDecidedAt" ELSE c."aiDecidedAt" END AS decided_at
    FROM "Comment" c
    WHERE c."authorId" = ANY(p_user_ids) AND c.status = 'REJECTED'
  ),
  recent_rejections AS (
    SELECT user_id,
      COUNT(*) FILTER (WHERE rule IN ('SPAM', 'SCAM_CONTACT', 'HARASSMENT', 'SLUR', 'PRIVATE_INFO', 'NOT_GENUINE'))::INT AS penalizing,
      COUNT(*) FILTER (WHERE rule = 'SPAM')::INT AS spam
    FROM rejections
    WHERE decided_at > NOW() - INTERVAL '90 days'
    GROUP BY user_id
  )
  SELECT u.id,
    COALESCE(p.published, 0),
    COALESCE(p.with_proof, 0),
    COALESCE(s.approved, 0),
    COALESCE(r.penalizing, 0),
    COALESCE(r.spam, 0),
    COALESCE(r.penalizing, 0) >= 2,
    u.spammer OR COALESCE(r.spam, 0) >= 4
  FROM "User" u
  LEFT JOIN posts p ON p.user_id = u.id
  LEFT JOIN suggestions s ON s.user_id = u.id
  LEFT JOIN recent_rejections r ON r.user_id = u.id
  WHERE u.id = ANY(p_user_ids);
$$ LANGUAGE sql STABLE;
