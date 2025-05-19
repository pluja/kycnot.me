CREATE OR REPLACE FUNCTION trigger_service_verification_status_change_notifications()
RETURNS TRIGGER AS $$
DECLARE
  v_status_change "ServiceVerificationStatusChange";
BEGIN
  -- Check if verificationStatus actually changed
  IF OLD."verificationStatus" IS DISTINCT FROM NEW."verificationStatus" THEN
    -- Determine the correct ServiceVerificationStatusChange enum value
    SELECT CASE NEW."verificationStatus"
            WHEN 'COMMUNITY_CONTRIBUTED' THEN 'STATUS_CHANGED_TO_COMMUNITY_CONTRIBUTED'
            WHEN 'APPROVED' THEN 'STATUS_CHANGED_TO_APPROVED'
            WHEN 'VERIFICATION_SUCCESS' THEN 'STATUS_CHANGED_TO_VERIFICATION_SUCCESS'
            WHEN 'VERIFICATION_FAILED' THEN 'STATUS_CHANGED_TO_VERIFICATION_FAILED'
            ELSE NULL
          END
    INTO v_status_change;

    -- Only insert if we determined a valid status change enum
    IF v_status_change IS NOT NULL THEN
      INSERT INTO "Notification" ("userId", "type", "aboutServiceId", "aboutServiceVerificationStatusChange")
      SELECT np."userId", 'SERVICE_VERIFICATION_STATUS_CHANGE', NEW.id, v_status_change
      FROM "_onVerificationChangeForServices" oes
      JOIN "NotificationPreferences" np ON oes."A" = np.id -- A -> NotificationPreferences.id
      WHERE oes."B" = NEW.id; -- B -> Service.id
    END IF;
  END IF;

  RETURN NULL; -- Return NULL for AFTER trigger
END;
$$ LANGUAGE plpgsql;

-- Trigger for Service verificationStatus updates
DROP TRIGGER IF EXISTS service_verification_status_change_notifications_trigger ON "Service";
CREATE TRIGGER service_verification_status_change_notifications_trigger
  AFTER UPDATE ON "Service"
  FOR EACH ROW
  EXECUTE FUNCTION trigger_service_verification_status_change_notifications(); 