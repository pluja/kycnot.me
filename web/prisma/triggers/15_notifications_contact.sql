CREATE OR REPLACE FUNCTION trigger_contact_notifications()
RETURNS TRIGGER AS $$
DECLARE
  thread_author INT;
  thread_category "ContactCategory";
  thread_comment INT;
  sender_id INT := COALESCE(NEW."authorId", -1);
BEGIN
  SELECT "authorId", "category", "commentId" INTO thread_author, thread_category, thread_comment
  FROM "ContactThread" WHERE "id" = NEW."threadId";

  IF NEW."fromStaff" THEN
    -- Staff replied: notify the thread author (if present and not the sender).
    IF thread_author IS NOT NULL AND thread_author <> sender_id THEN
      INSERT INTO "Notification" ("userId", "type", "aboutContactThreadId", "aboutContactMessageId")
      SELECT thread_author, 'CONTACT_MESSAGE', NEW."threadId", NEW."id"
      WHERE NOT EXISTS (
        SELECT 1 FROM "Notification" n
        WHERE n."userId" = thread_author
          AND n."type" = 'CONTACT_MESSAGE'
          AND n."aboutContactMessageId" = NEW."id"
      );
    END IF;
  ELSE
    -- User message: notify everyone who can manage this thread's category,
    -- except the sender. Full managers (admins or contact:manage) see all
    -- categories; contact:manage-urgent holders are notified only for urgent
    -- service reports, and comment moderators for reports about a post.
    INSERT INTO "Notification" ("userId", "type", "aboutContactThreadId", "aboutContactMessageId")
    SELECT u."id", 'CONTACT_MESSAGE', NEW."threadId", NEW."id"
    FROM "User" u
    WHERE (
        u."admin" = true
        OR 'contact:manage' = ANY(u."capabilities")
        OR (thread_category = 'SERVICE_REPORT_URGENT' AND 'contact:manage-urgent' = ANY(u."capabilities"))
        OR (thread_category = 'COMMENT_REPORT' AND 'comments:moderate' = ANY(u."capabilities"))
      )
      AND u."id" <> sender_id
      -- Mirrors conflictedCommentWhere: staff never handle reports about a service they represent,
      -- or, unless admins, about their own posts.
      AND NOT EXISTS (
        SELECT 1 FROM "Comment" c
        WHERE c."id" = thread_comment
          AND (
            EXISTS (SELECT 1 FROM "ServiceUser" su WHERE su."serviceId" = c."serviceId" AND su."userId" = u."id")
            OR (c."authorId" = u."id" AND NOT u."admin")
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM "Notification" n
        WHERE n."userId" = u."id"
          AND n."type" = 'CONTACT_MESSAGE'
          AND n."aboutContactMessageId" = NEW."id"
      );
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contact_message_notifications_trigger ON "ContactMessage";
CREATE TRIGGER contact_message_notifications_trigger
  AFTER INSERT ON "ContactMessage"
  FOR EACH ROW
  EXECUTE FUNCTION trigger_contact_notifications();
