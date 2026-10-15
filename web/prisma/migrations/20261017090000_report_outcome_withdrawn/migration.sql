-- A report on a post its author withdrew closes with its own outcome, which never counts against the reporter.
ALTER TYPE "CommentReportOutcome" ADD VALUE 'WITHDRAWN';
