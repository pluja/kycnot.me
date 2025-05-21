CREATE OR REPLACE FUNCTION trigger_karma_notifications()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create notification if the user has enabled karma notifications
  -- and the karma change exceeds their threshold
  INSERT INTO "Notification" ("userId", "type", "aboutKarmaTransactionId")
  SELECT NEW."userId", 'KARMA_CHANGE', NEW.id
  FROM "NotificationPreferences" np
  WHERE np."userId" = NEW."userId"
    AND ABS(NEW.points) >= COALESCE(np."karmaNotificationThreshold", 10)
    AND NOT EXISTS (
      SELECT 1 FROM "Notification" n
      WHERE n."userId" = NEW."userId"
        AND n."type" = 'KARMA_CHANGE'
        AND n."aboutKarmaTransactionId" = NEW.id
    );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop the trigger if it exists to ensure a clean setup
DROP TRIGGER IF EXISTS karma_notifications_trigger ON "KarmaTransaction";

-- Create the trigger to fire after inserts
CREATE TRIGGER karma_notifications_trigger
  AFTER INSERT ON "KarmaTransaction"
  FOR EACH ROW
  EXECUTE FUNCTION trigger_karma_notifications(); 