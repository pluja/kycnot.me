-- Function & Trigger for Root Comment Insertions (Approved/Verified)
CREATE OR REPLACE FUNCTION notify_root_comment_inserted()
RETURNS TRIGGER AS $$
DECLARE
  watcher_count INT;
BEGIN
  RAISE NOTICE '[notify_root_comment_inserted] Trigger fired for comment ID: %', NEW.id;
  WITH watchers AS (
    SELECT np."userId", np."enableNotifyPendingRepliesOnWatch"
    FROM "_onRootCommentCreatedForServices" rc
    JOIN "NotificationPreferences" np ON rc."A" = np."id"
    WHERE rc."B" = NEW."serviceId"
      AND np."userId" <> NEW."authorId"
  )
  INSERT INTO "Notification" ("userId", "type", "aboutCommentId")
  SELECT w."userId",
        'ROOT_COMMENT_CREATED',
        NEW."id"
  FROM watchers w
  WHERE (
    NEW.status IN ('APPROVED', 'VERIFIED')
    OR (NEW.status = 'PENDING' AND w."enableNotifyPendingRepliesOnWatch")
  )
  ON CONFLICT DO NOTHING;

  RAISE NOTICE '[notify_root_comment_inserted] Inserted % notifications for comment ID: %', FOUND, NEW.id;
  
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
    SELECT np."userId", np."enableNotifyPendingRepliesOnWatch"
    FROM "_watchedComments" w
    JOIN "NotificationPreferences" np ON w."B" = np."id"
    WHERE w."A" = NEW."parentId"
      AND np."userId" <> NEW."authorId"
  )
  INSERT INTO "Notification" ("userId", "type", "aboutCommentId")
  SELECT w."userId",
        'REPLY_COMMENT_CREATED',
        NEW."id"
  FROM watchers w
  WHERE (
    NEW.status IN ('APPROVED', 'VERIFIED')
    OR (NEW.status = 'PENDING' AND w."enableNotifyPendingRepliesOnWatch")
  )
  ON CONFLICT DO NOTHING;
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
    WHERE w."A" = NEW."parentId"
      AND np."userId" <> NEW."authorId"
  )
  INSERT INTO "Notification" ("userId", "type", "aboutCommentId")
  SELECT w."userId",
        'REPLY_COMMENT_CREATED',
        NEW."id"
  FROM watchers w
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_reply_approved ON "Comment";
CREATE TRIGGER trg_notify_reply_approved
  AFTER UPDATE OF status ON "Comment"
  FOR EACH ROW
  WHEN (NEW."parentId" IS NOT NULL AND NEW.status IN ('APPROVED', 'VERIFIED') AND OLD.status NOT IN ('APPROVED', 'VERIFIED'))
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
      AND np."userId" <> NEW."authorId"
      AND NOT np."enableNotifyPendingRepliesOnWatch"
  )
  INSERT INTO "Notification" ("userId", "type", "aboutCommentId")
  SELECT w."userId",
        'ROOT_COMMENT_CREATED',
        NEW."id"
  FROM watchers w
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_root_approved
  AFTER UPDATE OF status ON "Comment"
  FOR EACH ROW
  WHEN (NEW."parentId" IS NULL AND NEW.status IN ('APPROVED', 'VERIFIED') AND OLD.status NOT IN ('APPROVED', 'VERIFIED'))
  EXECUTE FUNCTION notify_root_approved();

-- Function & Trigger for Comment Status Changes (Status, Suspicious, AdminReview)
CREATE OR REPLACE FUNCTION notify_comment_status_changed()
RETURNS TRIGGER AS $$
DECLARE
  v_status_change "CommentStatusChange" := NULL;
BEGIN
  -- Determine the status change type
  IF NEW.status <> OLD.status THEN
    IF NEW.status = 'APPROVED' THEN v_status_change := 'STATUS_CHANGED_TO_APPROVED';
    ELSIF NEW.status = 'VERIFIED' THEN v_status_change := 'STATUS_CHANGED_TO_VERIFIED';
    ELSIF NEW.status = 'REJECTED' THEN v_status_change := 'STATUS_CHANGED_TO_REJECTED';
    ELSIF (NEW.status = 'PENDING' OR NEW.status = 'HUMAN_PENDING') AND (OLD.status <> 'PENDING' AND OLD.status <> 'HUMAN_PENDING') THEN v_status_change := 'STATUS_CHANGED_TO_PENDING';
    END IF;
  ELSIF NEW.suspicious <> OLD.suspicious THEN
    IF NEW.suspicious = true THEN v_status_change := 'MARKED_AS_SPAM';
    ELSE v_status_change := 'UNMARKED_AS_SPAM';
    END IF;
  ELSIF NEW."requiresAdminReview" <> OLD."requiresAdminReview" THEN
    IF NEW."requiresAdminReview" = true THEN v_status_change := 'MARKED_FOR_ADMIN_REVIEW';
    ELSE v_status_change := 'UNMARKED_FOR_ADMIN_REVIEW';
    END IF;
  END IF;

  -- If a relevant status change occurred, notify watchers of THIS comment
  IF v_status_change IS NOT NULL THEN
    WITH watchers AS (
      -- Get all watchers excluding author
      SELECT np."userId"
      FROM "_watchedComments" w
      JOIN "NotificationPreferences" np ON w."B" = np."id"
      WHERE w."A" = NEW."id"
        AND np."userId" <> NEW."authorId"
        AND np."enableOnMyCommentStatusChange"
      
      UNION ALL
      
      -- Add author if they have enabled notifications for their own comments
      SELECT np."userId"
      FROM "NotificationPreferences" np
      WHERE np."userId" = NEW."authorId"
        AND np."enableOnMyCommentStatusChange"
    )
    INSERT INTO "Notification" ("userId", "type", "aboutCommentId", "aboutCommentStatusChange")
    SELECT w."userId",
          'COMMENT_STATUS_CHANGE',
          NEW."id",
          v_status_change
    FROM watchers w
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_comment_status_changed ON "Comment";
CREATE TRIGGER trg_notify_comment_status_changed
  AFTER UPDATE OF status, suspicious, "requiresAdminReview" ON "Comment"
  FOR EACH ROW
  WHEN (NEW.status <> OLD.status OR NEW.suspicious <> OLD.suspicious OR NEW."requiresAdminReview" <> OLD."requiresAdminReview")
  EXECUTE FUNCTION notify_comment_status_changed();

-- Function & Trigger for Community Note Added
CREATE OR REPLACE FUNCTION notify_community_note_added()
RETURNS TRIGGER AS $$
BEGIN
  -- Notify watchers of this specific comment (excluding author)
  WITH watchers AS (
    SELECT np."userId"
    FROM "_watchedComments" w
    JOIN "NotificationPreferences" np ON w."B" = np."id"
    WHERE w."A" = NEW."id"
      AND np."userId" <> NEW."authorId"
  )
  INSERT INTO "Notification" ("userId", "type", "aboutCommentId")
  SELECT w."userId",
        'COMMUNITY_NOTE_ADDED',
        NEW."id"
  FROM watchers w
  ON CONFLICT DO NOTHING;

  -- Always notify the author
  INSERT INTO "Notification" ("userId", "type", "aboutCommentId")
  VALUES (NEW."authorId", 'COMMUNITY_NOTE_ADDED', NEW."id")
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_community_note_added ON "Comment";
CREATE TRIGGER trg_notify_community_note_added
  AFTER UPDATE OF "communityNote" ON "Comment"
  FOR EACH ROW
  WHEN (NEW."communityNote" IS NOT NULL AND NEW."communityNote" <> '' AND (OLD."communityNote" IS NULL OR OLD."communityNote" = ''))
  EXECUTE FUNCTION notify_community_note_added();

-- Remove the old monolithic trigger and function definition if they still exist
DROP TRIGGER IF EXISTS comment_notifications_trigger ON "Comment";
DROP FUNCTION IF EXISTS trigger_comment_notifications();
