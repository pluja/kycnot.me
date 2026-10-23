-- apply_comment_revision decides a pending edit for a moderator (p_decided_by) or the AI (NULL).
-- Approving keeps the live version in history, applies the edit and bumps the version. It never
-- touches the post's own moderation decision: a hold on the post outlives an approved edit. It returns
-- false and decides nothing when the edit is no longer pending, or when an approval would land on a
-- post that changed since the edit was written: a stale edit never overwrites a newer version.
-- experienceData was validated when the edit was submitted; the casts make a malformed record fail
-- instead of writing bad data.
CREATE OR REPLACE FUNCTION apply_comment_revision(
  p_revision_id INT,
  p_approve BOOLEAN,
  p_decided_by INT,
  p_reason TEXT,
  p_rule "CommentRule"
)
RETURNS BOOLEAN AS $$
DECLARE
  v_revision "CommentRevision"%ROWTYPE;
  v_comment "Comment"%ROWTYPE;
  v_data JSONB;
BEGIN
  SELECT * INTO v_revision FROM "CommentRevision" WHERE id = p_revision_id;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  SELECT * INTO v_comment FROM "Comment" WHERE id = v_revision."commentId" FOR UPDATE;
  SELECT * INTO v_revision FROM "CommentRevision" WHERE id = p_revision_id FOR UPDATE;
  IF v_revision.status <> 'PENDING' OR v_revision."redactedAt" IS NOT NULL THEN
    RETURN FALSE;
  END IF;
  IF p_approve AND (v_comment.status <> 'APPROVED' OR v_comment.version <> v_revision."baseVersion") THEN
    RETURN FALSE;
  END IF;

  IF p_approve THEN
    IF NOT EXISTS (
      SELECT 1 FROM "CommentRevision"
      WHERE "commentId" = v_comment.id AND content = v_comment.content AND kind = v_comment.kind
        AND status = 'APPROVED'
    ) THEN
      INSERT INTO "CommentRevision" (
        "commentId", "authorId", "baseVersion", content, kind, "experienceData", status, "createdAt", "decidedAt"
      )
      SELECT v_comment.id, v_comment."authorId", v_comment.version, v_comment.content, v_comment.kind,
        COALESCE(
          (SELECT jsonb_build_object(
             'occurredMonth', e."occurredMonth", 'sentiment', e.sentiment, 'outcome', e.outcome,
             'issues', to_jsonb(v_comment.issues)
           )
           FROM "CommentExperience" e WHERE e."commentId" = v_comment.id),
          '{}'::JSONB
        ),
        'APPROVED', v_comment."createdAt", COALESCE(v_comment."approvedAt", v_comment."createdAt");
    END IF;

    UPDATE "Comment" SET
      content = v_revision.content,
      kind = v_revision.kind,
      version = version + 1,
      "updatedAt" = NOW()
    WHERE id = v_comment.id;

    IF v_revision.kind = 'EXPERIENCE' THEN
      v_data := COALESCE(v_revision."experienceData", '{}'::JSONB);
      INSERT INTO "CommentExperience" ("commentId", "occurredMonth", sentiment, "sentimentSource", outcome)
      VALUES (
        v_comment.id,
        v_data->>'occurredMonth',
        (v_data->>'sentiment')::"ExperienceSentiment",
        CASE WHEN v_data->>'sentiment' IS NOT NULL
          THEN COALESCE((v_data->>'sentimentSource')::"SentimentSource", 'AUTHOR'::"SentimentSource")
        END,
        COALESCE(v_data->>'outcome', 'UNSPECIFIED')::"ExperienceOutcome"
      )
      ON CONFLICT ("commentId") DO UPDATE SET
        "occurredMonth" = EXCLUDED."occurredMonth",
        sentiment = EXCLUDED.sentiment,
        "sentimentSource" = EXCLUDED."sentimentSource",
        outcome = EXCLUDED.outcome,
        -- An author who changes the outcome in an edit overrides a moderator's resolution.
        "moderatorResolvedAt" = CASE WHEN EXCLUDED.outcome IS DISTINCT FROM "CommentExperience".outcome
          THEN NULL ELSE "CommentExperience"."moderatorResolvedAt" END,
        "moderatorResolvedById" = CASE WHEN EXCLUDED.outcome IS DISTINCT FROM "CommentExperience".outcome
          THEN NULL ELSE "CommentExperience"."moderatorResolvedById" END,
        "moderatorResolutionNote" = CASE WHEN EXCLUDED.outcome IS DISTINCT FROM "CommentExperience".outcome
          THEN NULL ELSE "CommentExperience"."moderatorResolutionNote" END;
      -- Edits written before the problem chips carry no tags and leave the post's tags as they are.
      IF v_data ? 'issues' THEN
        UPDATE "Comment" SET issues = ARRAY(
          SELECT jsonb_array_elements_text(v_data->'issues')
        )::"CommentIssueType"[]
        WHERE id = v_comment.id;
      END IF;
    END IF;
  END IF;

  UPDATE "CommentRevision" SET
    status = CASE WHEN p_approve THEN 'APPROVED'::"CommentStatus" ELSE 'REJECTED'::"CommentStatus" END,
    reason = p_reason,
    "decisionRule" = p_rule,
    "decidedById" = p_decided_by,
    "decidedAt" = NOW()
  WHERE id = p_revision_id;

  -- The author withdrawing their own post also rejects its pending edit; they need no notice of that.
  IF v_comment."authorId" IS NOT NULL AND v_comment."authorId" IS DISTINCT FROM p_decided_by THEN
    INSERT INTO "Notification" ("userId", type, "aboutCommentId")
    VALUES (v_comment."authorId", 'COMMENT_EDIT_REVIEWED', v_comment.id);
  END IF;

  INSERT INTO "AuditLog" ("actorId", action, "targetType", "targetId", summary)
  VALUES (
    p_decided_by, 'UPDATED', 'COMMENT', v_comment.id,
    CONCAT_WS(': ', CASE WHEN p_approve THEN 'Published edit' ELSE 'Rejected edit' END, p_rule::TEXT, p_reason)
  );
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
