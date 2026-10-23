-- Posts the old system published after a moderator held them kept the hold and stayed in the moderator queue.
-- A hold only applies while a post is pending; triggers/16_comment_moderation_state.sql now says so.
UPDATE "Comment"
SET "moderationState" = 'RESOLVED'
WHERE "humanAction" = 'HOLD'
  AND status <> 'PENDING'
  AND "moderationState" = 'AWAITING_HUMAN';
