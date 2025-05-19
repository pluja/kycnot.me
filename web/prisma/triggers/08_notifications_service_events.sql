CREATE OR REPLACE FUNCTION trigger_service_events_notifications()
RETURNS TRIGGER AS $$
BEGIN
  -- Handle new Event insertions
  IF TG_TABLE_NAME = 'Event' AND TG_OP = 'INSERT' THEN
    INSERT INTO "Notification" ("userId", "type", "aboutServiceId", "aboutEventId")
    SELECT np."userId", 'EVENT_CREATED', NEW."serviceId", NEW.id
    FROM "_onEventCreatedForServices" oes
    JOIN "NotificationPreferences" np ON oes."A" = np.id
    WHERE oes."B" = NEW."serviceId"
      AND NOT EXISTS (
        SELECT 1 FROM "Notification" n
        WHERE n."userId" = np."userId"
          AND n."type" = 'EVENT_CREATED'
          AND n."aboutEventId" = NEW.id
      );
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger for new Events
DROP TRIGGER IF EXISTS eVENT_CREATED_notifications_trigger ON "Event";
CREATE TRIGGER eVENT_CREATED_notifications_trigger
  AFTER INSERT ON "Event"
  FOR EACH ROW
  EXECUTE FUNCTION trigger_service_events_notifications();
