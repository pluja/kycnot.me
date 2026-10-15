-- Comment votes are removed. The karma ledger stays as frozen history; these drops clear the triggers
-- that older versions of prisma/triggers/01_comment_votes.sql created.
DROP TRIGGER IF EXISTS comment_status_change_trigger ON "Comment";
DROP TRIGGER IF EXISTS comment_suspicious_change_trigger ON "Comment";
DROP TRIGGER IF EXISTS comment_rating_mute_change_trigger ON "Comment";
DROP TRIGGER IF EXISTS comment_upvote_change_trigger ON "Comment";
DROP TRIGGER IF EXISTS comment_vote_change_trigger ON "CommentVote";
DROP TRIGGER IF EXISTS set_comment_vote_karma_trigger ON "CommentVote";
DROP TRIGGER IF EXISTS suggestion_status_change_trigger ON "ServiceSuggestion";
DROP TRIGGER IF EXISTS manual_karma_adjustment_trigger ON "KarmaTransaction";
DROP FUNCTION IF EXISTS handle_comment_upvote_change();
DROP FUNCTION IF EXISTS handle_comment_status_change();
DROP FUNCTION IF EXISTS handle_comment_approval(record, record);
DROP FUNCTION IF EXISTS handle_comment_verification(record, record);
DROP FUNCTION IF EXISTS handle_comment_spam_status();
DROP FUNCTION IF EXISTS handle_rating_mute_change(record, record);
DROP FUNCTION IF EXISTS handle_comment_flag_change();
DROP FUNCTION IF EXISTS handle_comment_vote_change();
DROP FUNCTION IF EXISTS set_comment_vote_karma();
DROP FUNCTION IF EXISTS insert_karma_transaction(integer, integer, text, integer, text, integer);
DROP FUNCTION IF EXISTS update_user_karma(integer, integer);
DROP FUNCTION IF EXISTS handle_suggestion_status_change();
DROP FUNCTION IF EXISTS handle_manual_karma_adjustment();
DROP TRIGGER IF EXISTS comment_upvotes_trigger ON "CommentVote";
DROP FUNCTION IF EXISTS update_comment_upvotes() CASCADE;

DROP TABLE "CommentVote";
ALTER TABLE "Comment" DROP COLUMN "upvotes";
