-- Derived moderation/queue state for a comment. Single source of truth for
-- the "is this in the moderator queue / has the AI looked at it" question,
-- computed from the raw status + ai/human verdict columns (which stay intact
-- for AI-vs-human dataset analysis).
--
-- Precedence (a human decision always wins; every PENDING row is forced into
-- one of the two AWAITING_* buckets so it can never be silently invisible):
--   1. human approved/rejected            -> RESOLVED
--   2. human held                         -> AWAITING_HUMAN
--   3. AI held, still pending             -> AWAITING_HUMAN
--   4. pending, AI never decided          -> AWAITING_AI
--   5. pending, anything else (safety)    -> AWAITING_HUMAN
--   6. otherwise (approved/rejected by AI) -> RESOLVED
CREATE OR REPLACE FUNCTION compute_comment_moderation_state(
  p_status "CommentStatus",
  p_ai_action "ModerationAction",
  p_human_action "ModerationAction",
  p_ai_decided_at TIMESTAMP
)
RETURNS "CommentModerationState" AS $$
BEGIN
  IF p_human_action IN ('APPROVE', 'REJECT') THEN
    RETURN 'RESOLVED';
  ELSIF p_human_action = 'HOLD' THEN
    RETURN 'AWAITING_HUMAN';
  ELSIF p_status = 'PENDING' AND p_ai_action = 'HOLD' THEN
    RETURN 'AWAITING_HUMAN';
  ELSIF p_status = 'PENDING' AND p_ai_decided_at IS NULL THEN
    RETURN 'AWAITING_AI';
  ELSIF p_status = 'PENDING' THEN
    RETURN 'AWAITING_HUMAN';
  ELSE
    RETURN 'RESOLVED';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION manage_comment_moderation_state()
RETURNS TRIGGER AS $$
BEGIN
  NEW."moderationState" := compute_comment_moderation_state(
    NEW.status, NEW."aiAction", NEW."humanAction", NEW."aiDecidedAt"
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_manage_comment_moderation_state ON "Comment";

CREATE TRIGGER trigger_manage_comment_moderation_state
BEFORE INSERT OR UPDATE OF status, "aiAction", "humanAction", "aiDecidedAt" ON "Comment"
FOR EACH ROW
EXECUTE FUNCTION manage_comment_moderation_state();
