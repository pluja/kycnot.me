CREATE OR REPLACE FUNCTION trigger_notification_push()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('notification_created', json_build_object('id', NEW.id)::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop the trigger if it exists to ensure a clean setup
DROP TRIGGER IF EXISTS notification_push_trigger ON "Notification";

-- Create the trigger to fire after inserts
CREATE TRIGGER notification_push_trigger
  AFTER INSERT ON "Notification"
  FOR EACH ROW
  EXECUTE FUNCTION trigger_notification_push(); 