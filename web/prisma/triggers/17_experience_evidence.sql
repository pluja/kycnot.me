CREATE OR REPLACE FUNCTION remove_orphaned_comment_evidence()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."commentId" IS NULL OR NEW."removedAt" IS NOT NULL THEN
    IF OLD."imagePath" IS NOT NULL THEN
      INSERT INTO "EvidenceFileCleanup" (path) VALUES (OLD."imagePath") ON CONFLICT DO NOTHING;
    END IF;
    NEW.body := NULL;
    NEW."imagePath" := NULL;
    NEW."normalizedId" := NULL;
    NEW."removedAt" := COALESCE(NEW."removedAt", NOW());
    NEW."needsCheck" := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS remove_orphaned_comment_evidence_trigger ON "CommentEvidence";
CREATE TRIGGER remove_orphaned_comment_evidence_trigger
BEFORE UPDATE OF "commentId", "authorId", "removedAt" ON "CommentEvidence"
FOR EACH ROW EXECUTE FUNCTION remove_orphaned_comment_evidence();

CREATE OR REPLACE FUNCTION save_first_published_comment_revision()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'APPROVED' AND NOT EXISTS (
    SELECT 1 FROM "CommentRevision" WHERE "commentId" = NEW.id AND status = 'APPROVED'
  ) THEN
    INSERT INTO "CommentRevision" ("commentId", "authorId", "baseVersion", content, kind, status, "createdAt", "decidedAt", "experienceData")
    VALUES (NEW.id, NEW."authorId", NEW.version, NEW.content, NEW.kind, NEW.status, NEW."createdAt", NOW(),
      (SELECT jsonb_build_object('occurredMonth', e."occurredMonth", 'sentiment', e.sentiment, 'outcome', e.outcome,
         'issues', to_jsonb(NEW.issues))
       FROM "CommentExperience" e WHERE e."commentId" = NEW.id));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS save_first_published_comment_revision_trigger ON "Comment";
CREATE TRIGGER save_first_published_comment_revision_trigger
AFTER UPDATE OF status ON "Comment"
FOR EACH ROW EXECUTE FUNCTION save_first_published_comment_revision();
