CREATE OR REPLACE FUNCTION manage_comment_approved_at()
RETURNS TRIGGER AS $$
BEGIN
  -- Set approvedAt when comment is approved or verified for the first time
  IF (NEW.status = 'APPROVED' OR NEW.status = 'VERIFIED') THEN
    IF OLD."approvedAt" IS NULL THEN
      NEW."approvedAt" := NOW();
    END IF;
  ELSE
    -- Clear approvedAt if status is changed away from approved/verified
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
