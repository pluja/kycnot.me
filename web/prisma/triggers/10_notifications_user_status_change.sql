CREATE OR REPLACE FUNCTION trigger_user_status_change_notifications()
RETURNS TRIGGER AS $$
DECLARE
  status_change "AccountStatusChange";
BEGIN
  -- Check for admin status change
  IF OLD.admin IS DISTINCT FROM NEW.admin THEN
    IF NEW.admin = true THEN
      status_change := 'ADMIN_TRUE';
    ELSE
      status_change := 'ADMIN_FALSE';
    END IF;
    INSERT INTO "Notification" ("userId", "type", "aboutAccountStatusChange")
    VALUES (NEW.id, 'ACCOUNT_STATUS_CHANGE', status_change);
  END IF;

  -- Check for verified status change
  IF OLD.verified IS DISTINCT FROM NEW.verified THEN
    IF NEW.verified = true THEN
      status_change := 'VERIFIED_TRUE';
    ELSE
      status_change := 'VERIFIED_FALSE';
    END IF;
    INSERT INTO "Notification" ("userId", "type", "aboutAccountStatusChange")
    VALUES (NEW.id, 'ACCOUNT_STATUS_CHANGE', status_change);
  END IF;

  -- Check for verifier status change
  IF OLD.verifier IS DISTINCT FROM NEW.verifier THEN
    IF NEW.verifier = true THEN
      status_change := 'VERIFIER_TRUE';
    ELSE
      status_change := 'VERIFIER_FALSE';
    END IF;
    INSERT INTO "Notification" ("userId", "type", "aboutAccountStatusChange")
    VALUES (NEW.id, 'ACCOUNT_STATUS_CHANGE', status_change);
  END IF;

  -- Check for spammer status change
  IF OLD.spammer IS DISTINCT FROM NEW.spammer THEN
    IF NEW.spammer = true THEN
      status_change := 'SPAMMER_TRUE';
    ELSE
      status_change := 'SPAMMER_FALSE';
    END IF;
    INSERT INTO "Notification" ("userId", "type", "aboutAccountStatusChange")
    VALUES (NEW.id, 'ACCOUNT_STATUS_CHANGE', status_change);
  END IF;

  -- Return NULL for AFTER triggers as the return value is ignored.
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Drop the trigger if it exists to ensure a clean setup
DROP TRIGGER IF EXISTS user_status_change_notifications_trigger ON "User";

-- Create the trigger to fire after updates on specific status columns
CREATE TRIGGER user_status_change_notifications_trigger
  AFTER UPDATE OF admin, verified, verifier, spammer ON "User"
  FOR EACH ROW
  EXECUTE FUNCTION trigger_user_status_change_notifications();
