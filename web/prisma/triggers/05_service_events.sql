-- Service Events Trigger
-- This trigger automatically creates events when services are updated
-- to track important changes over time

CREATE OR REPLACE FUNCTION trigger_service_events()
RETURNS TRIGGER AS $$
DECLARE
  change_descriptions TEXT[] := '{}';
  event_title TEXT;
  event_content TEXT;
  change_type TEXT := NULL;
  event_time TIMESTAMP WITH TIME ZONE := transaction_timestamp();
  currency_desc TEXT;
BEGIN
  -- Only proceed if this is an UPDATE operation
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  -- Check for domain/URL changes
  IF OLD."serviceUrls" IS DISTINCT FROM NEW."serviceUrls" THEN
    change_descriptions := array_append(change_descriptions, 
      'Service URLs updated from ' || array_to_string(OLD."serviceUrls", ', ') || 
      ' to ' || array_to_string(NEW."serviceUrls", ', ')
    );
    change_type := COALESCE(change_type, 'Domain change');
  END IF;

  -- Check for KYC level changes
  IF OLD."kycLevel" IS DISTINCT FROM NEW."kycLevel" THEN
    change_descriptions := array_append(change_descriptions, 
      'KYC level changed from ' || OLD."kycLevel"::TEXT || ' to ' || NEW."kycLevel"::TEXT
    );
    change_type := COALESCE(change_type, 'KYC update');
  END IF;

  -- Check for verification status changes
  IF OLD."verificationStatus" IS DISTINCT FROM NEW."verificationStatus" THEN
    change_descriptions := array_append(change_descriptions, 
      'Verification status changed from ' || OLD."verificationStatus"::TEXT || ' to ' || NEW."verificationStatus"::TEXT
    );
    change_type := COALESCE(change_type, 'Verification update');
  END IF;

  -- Check for description changes
  IF OLD.description IS DISTINCT FROM NEW.description THEN
    change_descriptions := array_append(change_descriptions, 'Description was updated');
    change_type := COALESCE(change_type, 'Description update');
  END IF;

  -- Check for currency changes
  IF OLD."acceptedCurrencies" IS DISTINCT FROM NEW."acceptedCurrencies" THEN
    -- Find currencies added
    WITH 
      old_currencies AS (SELECT unnest(OLD."acceptedCurrencies") AS currency),
      new_currencies AS (SELECT unnest(NEW."acceptedCurrencies") AS currency),
      added_currencies AS (
        SELECT currency FROM new_currencies
        EXCEPT
        SELECT currency FROM old_currencies
      ),
      removed_currencies AS (
        SELECT currency FROM old_currencies
        EXCEPT
        SELECT currency FROM new_currencies
      )
    
    -- Temp variable for currency description
    SELECT 
      CASE 
        WHEN (SELECT COUNT(*) FROM added_currencies) > 0 AND (SELECT COUNT(*) FROM removed_currencies) > 0 THEN
          'Currencies updated: added ' || array_to_string(ARRAY(SELECT currency FROM added_currencies), ', ') ||
          ', removed ' || array_to_string(ARRAY(SELECT currency FROM removed_currencies), ', ')
        WHEN (SELECT COUNT(*) FROM added_currencies) > 0 THEN
          'Added currencies: ' || array_to_string(ARRAY(SELECT currency FROM added_currencies), ', ')
        WHEN (SELECT COUNT(*) FROM removed_currencies) > 0 THEN
          'Removed currencies: ' || array_to_string(ARRAY(SELECT currency FROM removed_currencies), ', ')
        ELSE
          'Currencies changed'
      END
    INTO currency_desc;
    
    IF currency_desc IS NOT NULL AND currency_desc <> '' THEN
      change_descriptions := array_append(change_descriptions, currency_desc);
      change_type := COALESCE(change_type, 'Currency update');
    END IF;
  END IF;

  -- If there are changes, create an event
  IF array_length(change_descriptions, 1) > 0 THEN
    -- Create a title based on number of changes
    IF array_length(change_descriptions, 1) = 1 THEN
      event_title := COALESCE(change_type, 'Service updated'); -- Ensure title is not null
    ELSE
      event_title := 'Service updated';
    END IF;
    
    -- Create content with all changes
    event_content := array_to_string(change_descriptions, '. ');

    -- Ensure content is not null or empty
    IF event_content IS NULL OR event_content = '' THEN
      event_content := 'Service details changed (content unavailable)';
    END IF;
    
    -- Insert the event
    INSERT INTO "Event" (
      "title",
      "content",
      "type",
      "visible",
      "startedAt",
      "endedAt",
      "serviceId"
    ) VALUES (
      event_title,
      event_content,
      'UPDATE',
      TRUE,
      event_time,
      event_time,
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger for service updates
DROP TRIGGER IF EXISTS service_events_trigger ON "Service";
CREATE TRIGGER service_events_trigger
AFTER UPDATE OF "serviceUrls", "kycLevel", "verificationStatus", "description", "acceptedCurrencies" ON "Service"
FOR EACH ROW
EXECUTE FUNCTION trigger_service_events();

-- Additional trigger to monitor changes to ServiceAttribute
CREATE OR REPLACE FUNCTION trigger_service_attribute_events()
RETURNS TRIGGER AS $$
DECLARE
  attribute_name TEXT;
  service_name TEXT;
  event_title TEXT := 'Attribute change'; -- Default title
  event_content TEXT;
  event_time TIMESTAMP WITH TIME ZONE := transaction_timestamp();
  target_service_id INT;
  service_exists BOOLEAN;
  service_created_at TIMESTAMP WITH TIME ZONE;
  is_new_service BOOLEAN := FALSE;
BEGIN
  -- Determine target service ID and operation type
  IF TG_OP = 'INSERT' THEN
    target_service_id := NEW."serviceId";
    
    -- Check if this is a new service (created within the last minute)
    -- This helps prevent events when attributes are initially added to a new service
    SELECT "createdAt" INTO service_created_at FROM "Service" WHERE id = target_service_id;
    IF service_created_at IS NOT NULL AND (event_time - service_created_at) < INTERVAL '1 minute' THEN
      is_new_service := TRUE;
      RETURN NEW; -- Skip event creation for new services
    END IF;
    
    SELECT title INTO attribute_name FROM "Attribute" WHERE id = NEW."attributeId";
    SELECT name INTO service_name FROM "Service" WHERE id = target_service_id;
    IF attribute_name IS NOT NULL AND service_name IS NOT NULL THEN
        event_title := 'Attribute added';
        event_content := 'Attribute "' || attribute_name || '" was added to ' || service_name;
    ELSE
        event_content := 'An attribute was added (details unavailable)';
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    target_service_id := OLD."serviceId";
    -- Check if the service still exists before trying to fetch its name or create an event
    SELECT EXISTS (SELECT 1 FROM "Service" WHERE id = target_service_id) INTO service_exists;
    IF service_exists THEN
        SELECT title INTO attribute_name FROM "Attribute" WHERE id = OLD."attributeId";
        SELECT name INTO service_name FROM "Service" WHERE id = target_service_id;
        IF attribute_name IS NOT NULL AND service_name IS NOT NULL THEN
            event_title := 'Attribute removed';
            event_content := 'Attribute "' || attribute_name || '" was removed from ' || service_name;
        ELSE
            -- This case might happen if attribute was deleted concurrently
            event_content := 'An attribute was removed (details unavailable)'; 
        END IF;
    ELSE
        -- Service was deleted, don't create an event
        RETURN OLD;
    END IF;
  END IF;

  -- Ensure content is not null/empty and insert
  IF event_content IS NOT NULL AND event_content <> '' AND target_service_id IS NOT NULL AND NOT is_new_service THEN
    -- Re-check service existence right before insert just in case of concurrency on INSERT
    IF TG_OP = 'INSERT' THEN
      SELECT EXISTS (SELECT 1 FROM "Service" WHERE id = target_service_id) INTO service_exists;
    END IF;
    
    IF service_exists THEN
      INSERT INTO "Event" (
        "title",
        "content",
        "type",
        "visible",
        "startedAt",
        "endedAt",
        "serviceId"
      ) VALUES (
        event_title,
        event_content,
        'UPDATE',
        TRUE,
        event_time,
        event_time,
        target_service_id
      );
    END IF;
  END IF;

  -- Return appropriate record
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  ELSE
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger for service attribute changes
DROP TRIGGER IF EXISTS service_attribute_events_trigger ON "ServiceAttribute";
CREATE TRIGGER service_attribute_events_trigger
AFTER INSERT OR DELETE ON "ServiceAttribute"
FOR EACH ROW
EXECUTE FUNCTION trigger_service_attribute_events();

-- Additional trigger to monitor changes to service categories
CREATE OR REPLACE FUNCTION trigger_service_category_events()
RETURNS TRIGGER AS $$
DECLARE
  category_name TEXT;
  service_name TEXT;
  event_title TEXT := 'Category change'; -- Default title
  event_content TEXT;
  event_time TIMESTAMP WITH TIME ZONE := transaction_timestamp();
  target_service_id INT;
  service_exists BOOLEAN;
  service_created_at TIMESTAMP WITH TIME ZONE;
  is_new_service BOOLEAN := FALSE;
BEGIN
   -- Determine target service ID and operation type
  IF TG_OP = 'INSERT' THEN
    target_service_id := NEW."A";
    
    -- Check if this is a new service (created within the last minute)
    -- This helps prevent events when categories are initially added to a new service
    SELECT "createdAt" INTO service_created_at FROM "Service" WHERE id = target_service_id;
    IF service_created_at IS NOT NULL AND (event_time - service_created_at) < INTERVAL '1 minute' THEN
      is_new_service := TRUE;
      RETURN NEW; -- Skip event creation for new services
    END IF;
    
    SELECT name INTO category_name FROM "Category" WHERE id = NEW."B";
    SELECT name INTO service_name FROM "Service" WHERE id = target_service_id;
    IF category_name IS NOT NULL AND service_name IS NOT NULL THEN
        event_title := 'Category added';
        event_content := 'Category "' || category_name || '" was added to ' || service_name;
    ELSE
        event_content := 'A category was added (details unavailable)';
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    target_service_id := OLD."A";
    -- Check if the service still exists before trying to fetch its name or create an event
    SELECT EXISTS (SELECT 1 FROM "Service" WHERE id = target_service_id) INTO service_exists;
    IF service_exists THEN
        SELECT name INTO category_name FROM "Category" WHERE id = OLD."B";
        SELECT name INTO service_name FROM "Service" WHERE id = target_service_id;
        IF category_name IS NOT NULL AND service_name IS NOT NULL THEN
            event_title := 'Category removed';
            event_content := 'Category "' || category_name || '" was removed from ' || service_name;
        ELSE
            -- This case might happen if category was deleted concurrently
            event_content := 'A category was removed (details unavailable)';
        END IF;
    ELSE
        -- Service was deleted, don't create an event
        RETURN OLD;
    END IF;
  END IF;

  -- Ensure content is not null/empty and insert
  IF event_content IS NOT NULL AND event_content <> '' AND target_service_id IS NOT NULL AND NOT is_new_service THEN
    -- Re-check service existence right before insert just in case of concurrency on INSERT
    IF TG_OP = 'INSERT' THEN
      SELECT EXISTS (SELECT 1 FROM "Service" WHERE id = target_service_id) INTO service_exists;
    END IF;
    
    IF service_exists THEN
      INSERT INTO "Event" (
        "title",
        "content",
        "type",
        "visible",
        "startedAt",
        "endedAt",
        "serviceId"
      ) VALUES (
        event_title,
        event_content,
        'UPDATE',
        TRUE,
        event_time,
        event_time,
        target_service_id
      );
    END IF;
  END IF;

  -- Return appropriate record
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  ELSE
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger for service category changes (on the junction table)
DROP TRIGGER IF EXISTS service_category_events_trigger ON "_ServiceToCategory";
CREATE TRIGGER service_category_events_trigger
AFTER INSERT OR DELETE ON "_ServiceToCategory"
FOR EACH ROW
EXECUTE FUNCTION trigger_service_category_events();

-- Verification Steps Trigger
-- This trigger creates events when verification steps are added or status changes
CREATE OR REPLACE FUNCTION trigger_verification_step_events()
RETURNS TRIGGER AS $$
DECLARE
  service_name TEXT;
  event_title TEXT;
  event_content TEXT;
  event_time TIMESTAMP WITH TIME ZONE := transaction_timestamp();
  service_exists BOOLEAN;
BEGIN
  -- Check if the service exists
  SELECT EXISTS (SELECT 1 FROM "Service" WHERE id = NEW."serviceId") INTO service_exists;
  
  IF NOT service_exists THEN
    -- Service was deleted or doesn't exist, don't create an event
    RETURN NEW;
  END IF;
  
  -- Get service name
  SELECT name INTO service_name FROM "Service" WHERE id = NEW."serviceId";
  
  -- Handle different operations
  IF TG_OP = 'INSERT' THEN
    event_title := 'Verification step added';
    event_content := '"' || NEW.title || '" was added';
    
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    event_title := 'Verification step ' || replace(lower(NEW.status::TEXT), '_', ' ');
    event_content := '"' || NEW.title || '" status changed from ' || 
                    replace(lower(OLD.status::TEXT), '_', ' ') || ' to ' || replace(lower(NEW.status::TEXT), '_', ' ');
  ELSE
    -- No relevant changes, exit
    RETURN NEW;
  END IF;

  -- Insert the event
  INSERT INTO "Event" (
    "title",
    "content",
    "type",
    "visible",
    "startedAt",
    "endedAt",
    "serviceId"
  ) VALUES (
    event_title,
    event_content,
    'UPDATE',
    TRUE,
    event_time,
    event_time,
    NEW."serviceId"
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for verification step changes
DROP TRIGGER IF EXISTS verification_step_events_trigger ON "VerificationStep";
CREATE TRIGGER verification_step_events_trigger
AFTER INSERT OR UPDATE OF status ON "VerificationStep"
FOR EACH ROW
EXECUTE FUNCTION trigger_verification_step_events();
