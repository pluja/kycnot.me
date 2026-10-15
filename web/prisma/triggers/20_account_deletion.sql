-- delete_user_account removes an account but not its public record. A post that was ever published and not
-- rejected stays, unlinked from the account and with its proof, whatever its status now, so withdrawing and
-- then deleting leaves the same trace as withdrawing. Unreviewed edits of those posts are dropped.
-- Posts that were never public, or were rejected, are deleted. One of those that others replied to stays
-- as an empty WITHDRAWN placeholder, so their replies keep their thread; an answer to a deleted reply is
-- flagged so it doesn't read as a direct reply.
CREATE OR REPLACE FUNCTION delete_user_account(p_user_id INT)
RETURNS VOID AS $$
DECLARE
  v_removed INT[];
  v_placeholders INT[];
BEGIN
  -- Locking the account's posts makes a reply written meanwhile wait, instead of being deleted with its post.
  PERFORM 1 FROM "Comment" WHERE "authorId" = p_user_id FOR UPDATE;

  v_removed := ARRAY(
    SELECT c.id FROM "Comment" c
    WHERE c."authorId" = p_user_id
      AND (c.status = 'REJECTED' OR (
        c.status <> 'APPROVED' AND c."approvedAt" IS NULL
        AND NOT EXISTS (SELECT 1 FROM "CommentRevision" r WHERE r."commentId" = c.id AND r.status = 'APPROVED')
      ))
  );

  UPDATE "Comment" SET "replyTargetDeleted" = true
  WHERE "replyToId" = ANY(v_removed) AND NOT (id = ANY(v_removed));

  v_placeholders := ARRAY(
    SELECT c.id FROM "Comment" c
    WHERE c.id = ANY(v_removed) AND c."parentId" IS NULL
      AND EXISTS (SELECT 1 FROM "Comment" r WHERE r."parentId" = c.id AND NOT (r.id = ANY(v_removed)))
  );

  UPDATE "CommentEvidence" SET "commentId" = NULL
  WHERE "commentId" = ANY(v_placeholders);
  DELETE FROM "CommentRevision" WHERE "commentId" = ANY(v_placeholders);
  DELETE FROM "CommentExperience" WHERE "commentId" = ANY(v_placeholders);
  UPDATE "Comment" SET
    status = 'WITHDRAWN',
    "statusBeforeWithdrawal" = NULL,
    "withdrawnAt" = COALESCE("withdrawnAt", NOW()),
    "withdrawnVersion" = NULL,
    content = '',
    issues = '{}',
    "authorId" = NULL,
    "updatedAt" = NOW()
  WHERE id = ANY(v_placeholders);

  DELETE FROM "Comment" WHERE id = ANY(v_removed) AND NOT (id = ANY(v_placeholders));

  -- Only the published versions of a kept post stay. Pending and rejected edits, and the author's private note
  -- to moderators, were never public.
  DELETE FROM "CommentRevision"
  WHERE status <> 'APPROVED' AND "commentId" IN (SELECT id FROM "Comment" WHERE "authorId" = p_user_id);
  UPDATE "Comment" SET "authorId" = NULL, "authorNote" = NULL, "updatedAt" = NOW() WHERE "authorId" = p_user_id;

  DELETE FROM "User" WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql;
