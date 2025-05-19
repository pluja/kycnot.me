CREATE OR REPLACE FUNCTION trigger_service_suggestion_notifications()
RETURNS TRIGGER AS $$
DECLARE
  suggestion_status_change "ServiceSuggestionStatusChange";
BEGIN
  IF TG_OP = 'INSERT' THEN -- Corresponds to ServiceSuggestionMessage insert
    -- Notify suggestion author (if not the sender)
    INSERT INTO "Notification" ("userId", "type", "aboutServiceSuggestionId", "aboutServiceSuggestionMessageId")
    SELECT s."userId", 'SUGGESTION_MESSAGE', NEW."suggestionId", NEW."id"
    FROM "ServiceSuggestion" s
    WHERE s."id" = NEW."suggestionId"
      AND s."userId" <> NEW."userId"
      AND NOT EXISTS (
        SELECT 1 FROM "Notification" n
        WHERE n."userId" = s."userId"
          AND n."type" = 'SUGGESTION_MESSAGE'
          AND n."aboutServiceSuggestionMessageId" = NEW."id"
      );

    -- Notify all admins (except the sender), but only if sender is not admin
    INSERT INTO "Notification" ("userId", "type", "aboutServiceSuggestionId", "aboutServiceSuggestionMessageId")
    SELECT u."id", 'SUGGESTION_MESSAGE', NEW."suggestionId", NEW."id"
    FROM "User" u
    WHERE u."admin" = true
      AND u."id" <> NEW."userId"
      -- Only notify admins if the message sender is not an admin
      AND NOT EXISTS (SELECT 1 FROM "User" WHERE "id" = NEW."userId" AND "admin" = true)
      AND NOT EXISTS (
        SELECT 1 FROM "Notification" n
        WHERE n."userId" = u."id"
          AND n."type" = 'SUGGESTION_MESSAGE'
          AND n."aboutServiceSuggestionMessageId" = NEW."id"
      );

  ELSIF TG_OP = 'UPDATE' THEN -- Corresponds to ServiceSuggestion status update
    -- Notify suggestion author about status change
    IF NEW.status <> OLD.status THEN
      IF NEW.status = 'PENDING' THEN
        suggestion_status_change := 'STATUS_CHANGED_TO_PENDING';
      ELSIF NEW.status = 'APPROVED' THEN
        suggestion_status_change := 'STATUS_CHANGED_TO_APPROVED';
      ELSIF NEW.status = 'REJECTED' THEN
        suggestion_status_change := 'STATUS_CHANGED_TO_REJECTED';
      ELSIF NEW.status = 'WITHDRAWN' THEN
        suggestion_status_change := 'STATUS_CHANGED_TO_WITHDRAWN';
      END IF;

      INSERT INTO "Notification" ("userId", "type", "aboutServiceSuggestionId", "aboutSuggestionStatusChange")
      VALUES (NEW."userId", 'SUGGESTION_STATUS_CHANGE', NEW."id", suggestion_status_change);
    END IF;
  END IF;

  -- Use RETURN NULL for AFTER triggers as the return value is ignored.
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger for new messages
DROP TRIGGER IF EXISTS service_suggestion_message_notifications_trigger ON "ServiceSuggestionMessage";
CREATE TRIGGER service_suggestion_message_notifications_trigger
  AFTER INSERT ON "ServiceSuggestionMessage"
  FOR EACH ROW
  EXECUTE FUNCTION trigger_service_suggestion_notifications();

-- Trigger for status updates
DROP TRIGGER IF EXISTS service_suggestion_status_notifications_trigger ON "ServiceSuggestion";
CREATE TRIGGER service_suggestion_status_notifications_trigger
  AFTER UPDATE OF status ON "ServiceSuggestion"
  FOR EACH ROW
  -- Only run the function if the status actually changed
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION trigger_service_suggestion_notifications();
