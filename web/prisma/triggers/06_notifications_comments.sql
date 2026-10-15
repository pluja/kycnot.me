-- Function & Trigger for Root Comment Insertions (Approved/Verified)
CREATE OR REPLACE FUNCTION notify_root_comment_inserted()
RETURNS TRIGGER AS $$
BEGIN
  WITH watchers AS (
    SELECT np."userId"
    FROM "_onRootCommentCreatedForServices" rc
    JOIN "NotificationPreferences" np ON rc."A" = np."id"
    WHERE rc."B" = NEW."serviceId"
      AND np."userId" IS DISTINCT FROM NEW."authorId"
      AND EXISTS (
        SELECT 1 FROM "Service" s
        WHERE s.id = NEW."serviceId" AND s."serviceVisibility"::text IN ('PUBLIC', 'ARCHIVED', 'UNLISTED')
      )
  )
  INSERT INTO "Notification" ("userId", "type", "aboutCommentId")
  SELECT w."userId",
        'ROOT_COMMENT_CREATED',
        NEW."id"
  FROM watchers w
  WHERE (
    NEW.status = 'APPROVED'
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_root_comment_inserted ON "Comment";
CREATE TRIGGER trg_notify_root_comment_inserted
  AFTER INSERT ON "Comment"
  FOR EACH ROW
  WHEN (NEW."parentId" IS NULL)
  EXECUTE FUNCTION notify_root_comment_inserted();

-- Function & Trigger for Reply Comment Insertions
CREATE OR REPLACE FUNCTION notify_reply_comment_inserted()
RETURNS TRIGGER AS $$
BEGIN
  WITH watchers AS (
    SELECT np."userId"
    FROM "_watchedComments" w
    JOIN "NotificationPreferences" np ON w."B" = np."id"
    WHERE w."A" IN (NEW."parentId", NEW."replyToId")
      AND np."userId" IS DISTINCT FROM NEW."authorId"
      AND EXISTS (
        SELECT 1 FROM "Service" s
        WHERE s.id = NEW."serviceId" AND s."serviceVisibility"::text IN ('PUBLIC', 'ARCHIVED', 'UNLISTED')
      )
  )
  INSERT INTO "Notification" ("userId", "type", "aboutCommentId")
  SELECT DISTINCT w."userId",
        'REPLY_COMMENT_CREATED'::"NotificationType",
        NEW."id"
  FROM watchers w
  WHERE (
    NEW.status = 'APPROVED'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_reply_comment_inserted ON "Comment";
CREATE TRIGGER trg_notify_reply_comment_inserted
  AFTER INSERT ON "Comment"
  FOR EACH ROW
  WHEN (NEW."parentId" IS NOT NULL)
  EXECUTE FUNCTION notify_reply_comment_inserted();

-- Function & Trigger for Reply Approval/Verification
CREATE OR REPLACE FUNCTION notify_reply_approved()
RETURNS TRIGGER AS $$
BEGIN
  WITH watchers AS (
    SELECT np."userId"
    FROM "_watchedComments" w
    JOIN "NotificationPreferences" np ON w."B" = np."id"
    WHERE w."A" IN (NEW."parentId", NEW."replyToId")
      AND np."userId" IS DISTINCT FROM NEW."authorId"
      AND EXISTS (
        SELECT 1 FROM "Service" s
        WHERE s.id = NEW."serviceId" AND s."serviceVisibility"::text IN ('PUBLIC', 'ARCHIVED', 'UNLISTED')
      )
  )
  INSERT INTO "Notification" ("userId", "type", "aboutCommentId")
  SELECT DISTINCT w."userId",
        'REPLY_COMMENT_CREATED'::"NotificationType",
        NEW."id"
  FROM watchers w
  -- A post published again after a hold must not notify the same watchers twice.
  WHERE NOT EXISTS (
    SELECT 1 FROM "Notification" n
    WHERE n."userId" = w."userId" AND n.type = 'REPLY_COMMENT_CREATED' AND n."aboutCommentId" = NEW."id"
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_reply_approved ON "Comment";
CREATE TRIGGER trg_notify_reply_approved
  AFTER UPDATE OF status ON "Comment"
  FOR EACH ROW
  WHEN (NEW."parentId" IS NOT NULL AND NEW.status = 'APPROVED' AND OLD.status::text NOT IN ('APPROVED', 'WITHDRAWN'))
  EXECUTE FUNCTION notify_reply_approved();

DROP TRIGGER IF EXISTS trg_notify_root_approved ON "Comment";

CREATE OR REPLACE FUNCTION notify_root_approved()
RETURNS TRIGGER AS $$
BEGIN
  WITH watchers AS (
    SELECT np."userId"
    FROM "_onRootCommentCreatedForServices" rc
    JOIN "NotificationPreferences" np ON rc."A" = np."id"
    WHERE rc."B" = NEW."serviceId"
      AND np."userId" IS DISTINCT FROM NEW."authorId"
      AND EXISTS (
        SELECT 1 FROM "Service" s
        WHERE s.id = NEW."serviceId" AND s."serviceVisibility"::text IN ('PUBLIC', 'ARCHIVED', 'UNLISTED')
      )
  )
  INSERT INTO "Notification" ("userId", "type", "aboutCommentId")
  SELECT w."userId",
        'ROOT_COMMENT_CREATED',
        NEW."id"
  FROM watchers w
  WHERE NOT EXISTS (
    SELECT 1 FROM "Notification" n
    WHERE n."userId" = w."userId" AND n.type = 'ROOT_COMMENT_CREATED' AND n."aboutCommentId" = NEW."id"
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_root_approved
  AFTER UPDATE OF status ON "Comment"
  FOR EACH ROW
  WHEN (NEW."parentId" IS NULL AND NEW.status = 'APPROVED' AND OLD.status::text NOT IN ('APPROVED', 'WITHDRAWN'))
  EXECUTE FUNCTION notify_root_approved();

-- Function & Trigger for Comment Status Changes (status, rating mute, humanAction)
CREATE OR REPLACE FUNCTION notify_comment_status_changed()
RETURNS TRIGGER AS $$
DECLARE
  v_status_change "CommentStatusChange" := NULL;
BEGIN

  -- Withdrawing and restoring are the author's own moves, so nobody is told about them.
  IF NEW.status::text = 'WITHDRAWN' OR OLD.status::text = 'WITHDRAWN' THEN
    NULL;
  ELSIF NEW.status <> OLD.status THEN
    IF NEW.status = 'APPROVED' THEN v_status_change := 'STATUS_CHANGED_TO_APPROVED';
    ELSIF NEW.status = 'REJECTED' THEN v_status_change := 'STATUS_CHANGED_TO_REJECTED';
    ELSIF NEW.status = 'PENDING' AND OLD.status <> 'PENDING' THEN v_status_change := 'STATUS_CHANGED_TO_PENDING';
    END IF;
  ELSIF NEW."humanAction" IS DISTINCT FROM OLD."humanAction" THEN
    IF NEW."humanAction" = 'HOLD' AND OLD."humanAction" IS DISTINCT FROM 'HOLD' THEN
      v_status_change := 'MARKED_FOR_ADMIN_REVIEW';
    ELSIF OLD."humanAction" = 'HOLD' AND NEW."humanAction" IS DISTINCT FROM 'HOLD' THEN
      v_status_change := 'UNMARKED_FOR_ADMIN_REVIEW';
    END IF;
  END IF;

  IF v_status_change IS NOT NULL THEN
    WITH watchers AS (
      SELECT np."userId"
      FROM "_watchedComments" w
      JOIN "NotificationPreferences" np ON w."B" = np."id"
      WHERE w."A" = NEW."id"
        AND np."userId" IS DISTINCT FROM NEW."authorId"
        AND np."enableOnMyCommentStatusChange"
        AND NEW.status = 'APPROVED'

      UNION ALL

      SELECT np."userId"
      FROM "NotificationPreferences" np
      WHERE np."userId" = NEW."authorId"
        AND np."enableOnMyCommentStatusChange"
        -- An admin publishing or deciding their own post needs no notice of it
        AND NEW."humanDecidedById" IS DISTINCT FROM NEW."authorId"
    )
    INSERT INTO "Notification" ("userId", "type", "aboutCommentId", "aboutCommentStatusChange")
    SELECT w."userId",
          'COMMENT_STATUS_CHANGE',
          NEW."id",
          v_status_change
    FROM watchers w;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_comment_status_changed ON "Comment";
CREATE TRIGGER trg_notify_comment_status_changed
  AFTER UPDATE OF status, "humanAction" ON "Comment"
  FOR EACH ROW
  WHEN (
    NEW.status <> OLD.status
    OR NEW."humanAction" IS DISTINCT FROM OLD."humanAction"
  )
  EXECUTE FUNCTION notify_comment_status_changed();

-- Function & Trigger for Community Note Added
CREATE OR REPLACE FUNCTION notify_community_note_added()
RETURNS TRIGGER AS $$
BEGIN
  -- Only a published post with an author has anyone to tell.
  IF NEW.status::text <> 'APPROVED' OR NEW."authorId" IS NULL THEN
    RETURN NEW;
  END IF;
  -- Notify watchers of this specific comment (excluding author)
  WITH watchers AS (
    SELECT np."userId"
    FROM "_watchedComments" w
    JOIN "NotificationPreferences" np ON w."B" = np."id"
    WHERE w."A" = NEW."id"
      AND np."userId" IS DISTINCT FROM NEW."authorId"
  )
  INSERT INTO "Notification" ("userId", "type", "aboutCommentId")
  SELECT w."userId",
        'COMMUNITY_NOTE_ADDED',
        NEW."id"
  FROM watchers w;

  -- Always notify the author
  INSERT INTO "Notification" ("userId", "type", "aboutCommentId")
  VALUES (NEW."authorId", 'COMMUNITY_NOTE_ADDED', NEW."id");

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_community_note_added ON "Comment";
CREATE TRIGGER trg_notify_community_note_added
  AFTER UPDATE OF "publicNote" ON "Comment"
  FOR EACH ROW
  WHEN (NEW."publicNote" IS NOT NULL AND NEW."publicNote" <> '' AND (OLD."publicNote" IS NULL OR OLD."publicNote" = ''))
  EXECUTE FUNCTION notify_community_note_added();

-- Remove the old monolithic trigger and function definition if they still exist
DROP TRIGGER IF EXISTS comment_notifications_trigger ON "Comment";
DROP FUNCTION IF EXISTS trigger_comment_notifications();
