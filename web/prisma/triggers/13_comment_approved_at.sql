CREATE OR REPLACE FUNCTION manage_comment_approved_at()
RETURNS TRIGGER AS $$
BEGIN
  -- Stamp approvedAt when a comment becomes published, not when a published comment is saved again
  IF NEW.status = 'APPROVED' THEN
    IF OLD.status <> 'APPROVED' AND NEW."approvedAt" IS NULL THEN
      NEW."approvedAt" := NOW();
    END IF;
  ELSIF NEW.status::text <> 'WITHDRAWN' THEN
    -- Clear approvedAt if status is changed away from approved; a withdrawn post keeps it for its restore.
    NEW."approvedAt" := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_manage_comment_approved_at ON "Comment";

CREATE TRIGGER trigger_manage_comment_approved_at
BEFORE UPDATE OF status ON "Comment"
FOR EACH ROW
EXECUTE FUNCTION manage_comment_approved_at();
