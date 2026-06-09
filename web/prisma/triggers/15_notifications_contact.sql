CREATE OR REPLACE FUNCTION trigger_contact_notifications()
RETURNS TRIGGER AS $$
DECLARE
  thread_author INT;
  sender_id INT := COALESCE(NEW."authorId", -1);
BEGIN
  SELECT "authorId" INTO thread_author FROM "ContactThread" WHERE "id" = NEW."threadId";

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
    -- User message: notify everyone who can manage the contact queue
    -- (admins or holders of the contact:manage capability), except the sender.
    INSERT INTO "Notification" ("userId", "type", "aboutContactThreadId", "aboutContactMessageId")
    SELECT u."id", 'CONTACT_MESSAGE', NEW."threadId", NEW."id"
    FROM "User" u
    WHERE (u."admin" = true OR 'contact:manage' = ANY(u."capabilities"))
      AND u."id" <> sender_id
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
