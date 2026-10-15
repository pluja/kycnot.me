import { ExperienceSentiment, type Prisma } from '@prisma/client'
import { z } from 'astro/zod'
import { ActionError } from 'astro:actions'

import { recordAuditLog } from '../../lib/auditLog'
import { cleanupCommentEvidenceFiles } from '../../lib/commentEvidenceCleanup'
import {
  ADMIN_NOTE_MAX_LENGTH,
  moderatorReasonSchema,
  PROOF_REQUEST_MESSAGE_LENGTH,
  PUBLIC_NOTE_MAX_LENGTH,
} from '../../lib/commentLimits'
import { latestCheckSelect } from '../../lib/commentPage'
import { classifyCommentProof } from '../../lib/commentProof'
import { commentContentHash, commentRedactionInput, isValidRedaction } from '../../lib/commentRedaction'
import { applyCommentRevision } from '../../lib/dbFunctions'
import { defineProtectedAction } from '../../lib/defineProtectedAction'
import { checkExperienceModerator, publishIfHeldOnlyForProof } from '../../lib/experienceModeration'
import { publicationInput, evidenceCheckInput } from '../../lib/experienceModerationInput'
import { classifiedKindSchema, isPublishedComment } from '../../lib/experiences'
import { cap, userCan } from '../../lib/permissions'
import { prisma } from '../../lib/prisma'
import { countsAsProof } from '../../lib/proofEvidence'
import { createProofRequest } from '../../lib/proofRequests'
import { absoluteSiteUrl } from '../../lib/urls'

const commentId = z.coerce.number().int().positive()

async function updateNote(
  actorId: number,
  targetId: number,
  data: Prisma.CommentUpdateInput,
  summary: string
) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Comment" WHERE id=${targetId} FOR UPDATE`
    await checkExperienceModerator(tx, actorId, targetId)
    await tx.comment.update({ where: { id: targetId }, data })
    await recordAuditLog(tx, {
      actorId,
      action: 'UPDATED',
      targetType: 'COMMENT',
      targetId,
      summary,
    })
  })
}

const proofRemovalInput = z.object({
  evidenceId: z.coerce.number().int().positive(),
  reason: z.string().trim().min(3).max(200),
})

// lockProof locks a proof and its post, comment first: the order every proof action locks in, so they cannot deadlock.
async function lockProof(tx: Pick<typeof prisma, '$queryRaw'>, evidenceId: number) {
  await tx.$queryRaw`SELECT id FROM "Comment" WHERE id = (SELECT "commentId" FROM "CommentEvidence" WHERE id = ${evidenceId}) FOR UPDATE`
  await tx.$queryRaw`SELECT id FROM "CommentEvidence" WHERE id = ${evidenceId} FOR UPDATE`
}

// lockProofForRemoval locks live proof for a moderator to remove. Only another moderator may remove proof on their
// own post, unless they are an admin.
async function lockProofForRemoval(
  tx: Pick<typeof prisma, '$queryRaw' | 'comment' | 'commentEvidence' | 'user'>,
  evidenceId: number,
  user: { id: number; admin: boolean }
) {
  await lockProof(tx, evidenceId)
  const evidence = await tx.commentEvidence.findUnique({
    where: { id: evidenceId },
    select: {
      commentId: true,
      removedAt: true,
      body: true,
      imagePath: true,
      checks: latestCheckSelect,
    },
  })
  if (!evidence?.commentId || evidence.removedAt) throw new ActionError({ code: 'NOT_FOUND' })
  const comment = await checkExperienceModerator(tx, user.id, evidence.commentId)
  if (!user.admin && comment.authorId === user.id) {
    throw new ActionError({
      code: 'FORBIDDEN',
      message: 'Another moderator must remove proof on your own post.',
    })
  }
  return { evidence: { ...evidence, commentId: evidence.commentId }, comment }
}

export const adminExperienceActions = {
  saveNote: defineProtectedAction({
    accept: 'form',
    permissions: cap('comments:moderate'),
    input: z.object({ commentId, adminNote: z.string().trim().max(ADMIN_NOTE_MAX_LENGTH).nullish() }),
    handler: (input, context) =>
      updateNote(
        context.locals.user.id,
        input.commentId,
        { adminNote: input.adminNote || null },
        'Updated private moderation note'
      ),
  }),
  savePublicNote: defineProtectedAction({
    accept: 'form',
    permissions: cap('comments:moderate'),
    input: z.object({ commentId, publicNote: z.string().trim().max(PUBLIC_NOTE_MAX_LENGTH).nullish() }),
    handler: (input, context) =>
      updateNote(
        context.locals.user.id,
        input.commentId,
        { publicNote: input.publicNote || null },
        'Updated public moderator note'
      ),
  }),
  classify: defineProtectedAction({
    accept: 'form',
    permissions: cap('comments:moderate'),
    input: z.object({
      commentId,
      kind: classifiedKindSchema,
      sentiment: z.nativeEnum(ExperienceSentiment).or(z.literal('')),
      reason: moderatorReasonSchema,
    }),
    handler: async (input, context) => {
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Comment" WHERE id=${input.commentId} FOR UPDATE`
        const original = await checkExperienceModerator(tx, context.locals.user.id, input.commentId)
        const post = await tx.comment.findUniqueOrThrow({
          where: { id: input.commentId },
          select: { parentId: true, content: true, experience: { select: { sentimentSource: true } } },
        })
        if (post.parentId) {
          throw new ActionError({ code: 'BAD_REQUEST', message: 'Replies remain discussion.' })
        }
        if (post.experience?.sentimentSource === 'AUTHOR') {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message:
              'The author chose this sentiment. Ask them to correct it or review the post for a rule violation.',
          })
        }
        const pendingEdits = await tx.commentRevision.count({
          where: { commentId: input.commentId, status: 'PENDING' },
        })
        if (pendingEdits) {
          throw new ActionError({
            code: 'CONFLICT',
            message: 'Review the pending edit first. Changing the post type would make it unpublishable.',
          })
        }
        await tx.comment.update({
          where: { id: input.commentId },
          data: { kind: input.kind, version: { increment: 1 } },
        })
        if (input.kind === 'EXPERIENCE') {
          await tx.commentExperience.upsert({
            where: { commentId: input.commentId },
            create: {
              commentId: input.commentId,
              sentiment: input.sentiment || null,
              sentimentSource: 'MODERATOR',
            },
            update: { sentiment: input.sentiment || null, sentimentSource: 'MODERATOR' },
          })
        }
        if (isPublishedComment(original.status)) {
          await tx.commentRevision.create({
            data: {
              commentId: input.commentId,
              authorId: original.authorId,
              baseVersion: original.version,
              content: post.content,
              kind: input.kind,
              status: 'APPROVED',
              reason: input.reason,
              decidedById: context.locals.user.id,
              decidedAt: new Date(),
            },
          })
        }
        if (original.authorId !== null) {
          await tx.notification.create({
            data: {
              userId: original.authorId,
              type: 'COMMENT_EDIT_REVIEWED',
              aboutCommentId: input.commentId,
            },
          })
        }
        await recordAuditLog(tx, {
          actorId: context.locals.user.id,
          action: 'UPDATED',
          targetType: 'COMMENT',
          targetId: input.commentId,
          summary: `Corrected classification: ${input.reason}`,
        })
      })
    },
  }),
  publish: defineProtectedAction({
    accept: 'form',
    permissions: cap('comments:moderate'),
    input: publicationInput,
    handler: async (input, context) => {
      const decisionReason = input.decisionReason || null
      const reason = input.reason || null
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Comment" WHERE id = ${input.commentId} FOR UPDATE`
        const current = await checkExperienceModerator(tx, context.locals.user.id, input.commentId)
        if (current.status === 'WITHDRAWN') {
          throw new ActionError({
            code: 'CONFLICT',
            message:
              'The author withdrew this post, or it belonged to a deleted account. It can no longer be decided.',
          })
        }
        if (input.seenStatus) {
          const { humanDecidedAt } = await tx.comment.findUniqueOrThrow({
            where: { id: input.commentId },
            select: { humanDecidedAt: true },
          })
          if (
            current.status !== input.seenStatus ||
            (humanDecidedAt?.toISOString() ?? '') !== (input.seenDecidedAt ?? '')
          ) {
            throw new ActionError({
              code: 'CONFLICT',
              message: 'Someone decided this post while you had it open. Reload to see their decision.',
            })
          }
        }
        await tx.comment.update({
          where: { id: input.commentId },
          data: {
            status: input.status,
            humanAction:
              input.status === 'APPROVED' ? 'APPROVE' : input.status === 'REJECTED' ? 'REJECT' : 'HOLD',
            humanDecisionReason: decisionReason,
            humanReasoning: reason,
            humanDecidedAt: new Date(),
            humanDecidedById: context.locals.user.id,
            ...(input.publicNote ? { publicNote: input.publicNote } : {}),
          },
        })
        await recordAuditLog(tx, {
          actorId: context.locals.user.id,
          action: 'STATUS_CHANGED',
          targetType: 'COMMENT',
          targetId: input.commentId,
          summary: [input.status, decisionReason, reason].filter(Boolean).join(': '),
        })
      })
    },
  }),
  reviewRevision: defineProtectedAction({
    accept: 'form',
    permissions: cap('comments:moderate'),
    input: z.object({
      revisionId: z.coerce.number().int().positive(),
      approve: z.coerce.boolean(),
      reason: moderatorReasonSchema,
    }),
    handler: async (input, context) => {
      await prisma.$transaction(async (tx) => {
        const revision = await tx.commentRevision.findUnique({
          where: { id: input.revisionId },
          select: { commentId: true },
        })
        if (!revision) throw new ActionError({ code: 'NOT_FOUND' })
        await checkExperienceModerator(tx, context.locals.user.id, revision.commentId)
        const decided = await applyCommentRevision(tx, {
          revisionId: input.revisionId,
          approve: input.approve,
          decidedById: context.locals.user.id,
          reason: input.reason,
        })
        if (!decided) {
          throw new ActionError({
            code: 'CONFLICT',
            message: input.approve
              ? 'The post changed or the edit is no longer pending. Reject this edit and request a new one.'
              : 'This edit is no longer pending.',
          })
        }
      })
    },
  }),
  redactRevision: defineProtectedAction({
    accept: 'form',
    permissions: cap('comments:redact'),
    input: commentRedactionInput,
    handler: async (input, context) => {
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Comment" WHERE id = ${input.commentId} FOR UPDATE`
        const comment = await checkExperienceModerator(tx, context.locals.user.id, input.commentId)
        if (comment.version !== input.version) {
          throw new ActionError({
            code: 'CONFLICT',
            message: 'The post changed. Reload it before removing text.',
          })
        }
        const post = await tx.comment.findUniqueOrThrow({
          where: { id: input.commentId },
          select: {
            content: true,
            kind: true,
            issues: true,
            publicNote: true,
            experience: {
              select: {
                occurredMonth: true,
                sentiment: true,
                outcome: true,
              },
            },
          },
        })
        const revision = input.revisionId
          ? await tx.commentRevision.findUnique({
              where: { id: input.revisionId },
              select: { commentId: true, content: true },
            })
          : null
        if (input.revisionId && revision?.commentId !== input.commentId) {
          throw new ActionError({ code: 'NOT_FOUND' })
        }
        const originalContent = revision?.content ?? post.content
        if (commentContentHash(originalContent) !== input.sourceHash) {
          throw new ActionError({
            code: 'CONFLICT',
            message: 'This version changed. Reload it before removing text.',
          })
        }
        if (!isValidRedaction(originalContent, input.content)) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message:
              'Keep the original wording and replace only the sensitive parts with [removed]. To remove everything, use [Removed by moderation].',
          })
        }
        const redaction = { content: input.content, redactedAt: new Date() }
        const revised = await tx.commentRevision.updateMany({
          where: { commentId: input.commentId, content: originalContent, status: { not: 'PENDING' } },
          data: redaction,
        })
        const rejected = await tx.commentRevision.updateMany({
          where: { commentId: input.commentId, content: originalContent, status: 'PENDING' },
          data: {
            ...redaction,
            status: 'REJECTED',
            reason: 'Rejected because sensitive text was removed from the post.',
            decidedById: context.locals.user.id,
            decidedAt: new Date(),
          },
        })
        if (post.content === originalContent) {
          const notice = 'Sensitive details were removed by a moderator.'
          await tx.comment.update({
            where: { id: input.commentId },
            data: {
              content: input.content,
              version: { increment: 1 },
              publicNote: post.publicNote?.includes(notice)
                ? post.publicNote
                : [post.publicNote, notice].filter(Boolean).join('\n\n'),
            },
          })
          if (!revised.count && !rejected.count) {
            await tx.commentRevision.create({
              data: {
                ...redaction,
                commentId: input.commentId,
                authorId: comment.authorId,
                baseVersion: comment.version,
                kind: post.kind,
                experienceData: post.experience ? { ...post.experience, issues: post.issues } : {},
                status: isPublishedComment(comment.status) ? 'APPROVED' : 'REJECTED',
                decidedById: context.locals.user.id,
                decidedAt: new Date(),
              },
            })
          }
        }
        await tx.case.updateMany({
          where: { sourceCommentId: input.commentId, summaryMd: originalContent },
          data: { summaryMd: input.content },
        })
        if (comment.authorId !== null) {
          await tx.notification.create({
            data: { userId: comment.authorId, type: 'COMMENT_EDIT_REVIEWED', aboutCommentId: comment.id },
          })
        }
        await recordAuditLog(tx, {
          actorId: context.locals.user.id,
          targetType: 'COMMENT',
          targetId: input.commentId,
          action: 'UPDATED',
          summary: `Removed sensitive text: ${input.reason}`,
        })
      })
    },
  }),
  deleteEvidence: defineProtectedAction({
    accept: 'form',
    permissions: cap('comments:moderate'),
    input: proofRemovalInput,
    handler: async (input, context) => {
      await prisma.$transaction(async (tx) => {
        const { evidence } = await lockProofForRemoval(tx, input.evidenceId, context.locals.user)
        await tx.commentEvidence.update({ where: { id: input.evidenceId }, data: { removedAt: new Date() } })
        await recordAuditLog(tx, {
          actorId: context.locals.user.id,
          action: 'DELETED',
          targetType: 'COMMENT',
          targetId: evidence.commentId,
          summary: `Deleted proof ${input.evidenceId.toString()}: ${input.reason}`,
        })
      })
      await cleanupCommentEvidenceFiles()
    },
  }),
  removeEvidenceImage: defineProtectedAction({
    accept: 'form',
    permissions: cap('comments:moderate'),
    input: proofRemovalInput,
    handler: async (input, context) => {
      await prisma.$transaction(async (tx) => {
        const { evidence, comment } = await lockProofForRemoval(tx, input.evidenceId, context.locals.user)
        if (!evidence.imagePath) {
          throw new ActionError({ code: 'BAD_REQUEST', message: 'This proof has no screenshot.' })
        }
        // These results can rest on the screenshot, so the result has to change before the image goes.
        if (
          ['SCREENSHOT_REVIEWED', 'TRANSACTION_SUPPORTED', 'REFUND_SUPPORTED', 'CLAIM_SUPPORTED'].includes(
            evidence.checks[0]?.finding ?? ''
          )
        ) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: 'The current result rests on the screenshot. Record a new result first.',
          })
        }
        if (!evidence.body) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: 'The screenshot is the whole proof. Delete it instead.',
          })
        }
        await tx.evidenceFileCleanup.upsert({
          where: { path: evidence.imagePath },
          create: { path: evidence.imagePath },
          update: {},
        })
        await tx.commentEvidence.update({
          where: { id: input.evidenceId },
          data: {
            imagePath: null,
            ...(await classifyCommentProof(tx, comment.serviceId, evidence.body, false)),
          },
        })
        await recordAuditLog(tx, {
          actorId: context.locals.user.id,
          action: 'UPDATED',
          targetType: 'COMMENT',
          targetId: evidence.commentId,
          summary: `Removed the screenshot from proof ${input.evidenceId.toString()}: ${input.reason}`,
        })
      })
      await cleanupCommentEvidenceFiles()
    },
  }),
  checkEvidence: defineProtectedAction({
    accept: 'form',
    permissions: cap('comments:moderate'),
    input: evidenceCheckInput,
    handler: async (input, context) => {
      return prisma.$transaction(async (tx) => {
        await lockProof(tx, input.evidenceId)
        const evidence = await tx.commentEvidence.findUnique({
          where: { id: input.evidenceId },
          select: { commentId: true, removedAt: true },
        })
        if (!evidence?.commentId || evidence.removedAt) throw new ActionError({ code: 'NOT_FOUND' })
        const comment = await checkExperienceModerator(tx, context.locals.user.id, evidence.commentId)
        // A proof check is a second pair of eyes, so only a full admin may check proof on their own post.
        const selfCheck = comment.authorId === context.locals.user.id
        if (selfCheck && !context.locals.user.admin) {
          throw new ActionError({
            code: 'FORBIDDEN',
            message: 'Another moderator must check proof on your own post.',
          })
        }
        await tx.evidenceCheck.create({
          data: {
            evidenceId: input.evidenceId,
            finding: input.finding,
            explanation: input.explanation,
            moderatorId: context.locals.user.id,
            checkedAt: new Date(),
          },
        })
        await tx.commentEvidence.update({ where: { id: input.evidenceId }, data: { needsCheck: false } })
        if (countsAsProof({ removedAt: null, checks: [{ finding: input.finding }] })) {
          await tx.proofRequest.updateMany({
            where: { commentId: evidence.commentId, cancelledAt: null },
            data: { cancelledAt: new Date() },
          })
        }
        const publishedPost = await publishIfHeldOnlyForProof(tx, evidence.commentId, context.locals.user.id)
        if (comment.authorId !== null) {
          await tx.notification.create({
            data: {
              userId: comment.authorId,
              type: 'COMMENT_EVIDENCE_CHECKED',
              aboutCommentId: evidence.commentId,
            },
          })
        }
        await recordAuditLog(tx, {
          actorId: context.locals.user.id,
          targetType: 'COMMENT',
          targetId: evidence.commentId,
          action: 'UPDATED',
          summary: `Recorded evidence finding: ${input.finding}${selfCheck ? ' (admin checked their own proof)' : ''}`,
        })
        return { publishedPost }
      })
    },
  }),
  requestProof: defineProtectedAction({
    accept: 'form',
    permissions: cap('comments:moderate'),
    input: z.object({
      commentId,
      message: z.string().trim().min(PROOF_REQUEST_MESSAGE_LENGTH.min).max(PROOF_REQUEST_MESSAGE_LENGTH.max),
    }),
    handler: async (input, context) => {
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Comment" WHERE id = ${input.commentId} FOR UPDATE`
        const comment = await checkExperienceModerator(tx, context.locals.user.id, input.commentId)
        const post = await tx.comment.findUniqueOrThrow({
          where: { id: input.commentId },
          select: {
            parentId: true,
            kind: true,
            proofRequests: { where: { cancelledAt: null }, select: { id: true } },
            evidence: { where: { needsCheck: true, removedAt: null }, select: { id: true } },
          },
        })
        if (
          post.parentId ||
          post.kind !== 'EXPERIENCE' ||
          !['APPROVED', 'PENDING'].includes(comment.status)
        ) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: 'Only a published or held experience can be asked for proof.',
          })
        }
        if (comment.authorId === null) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: 'The author deleted their account, so nobody can answer a request.',
          })
        }
        if (post.proofRequests.length) {
          throw new ActionError({
            code: 'CONFLICT',
            message: 'This post already has a request. Cancel it before asking again.',
          })
        }
        if (post.evidence.length) {
          throw new ActionError({
            code: 'CONFLICT',
            message: 'Check the proof the author already sent first. Ask for more if it is not enough.',
          })
        }
        await createProofRequest(tx, {
          commentId: input.commentId,
          authorId: comment.authorId,
          source: 'MODERATOR',
          requestedById: context.locals.user.id,
          message: input.message,
        })
        await recordAuditLog(tx, {
          actorId: context.locals.user.id,
          targetType: 'COMMENT',
          targetId: input.commentId,
          action: 'UPDATED',
          summary: 'Asked the author for proof',
        })
      })
    },
  }),
  cancelProofRequest: defineProtectedAction({
    accept: 'form',
    permissions: cap('comments:moderate'),
    input: z.object({ requestId: z.coerce.number().int().positive() }),
    handler: async (input, context) => {
      await prisma.$transaction(async (tx) => {
        const request = await tx.proofRequest.findUnique({
          where: { id: input.requestId },
          select: { commentId: true, cancelledAt: true },
        })
        if (!request || request.cancelledAt) throw new ActionError({ code: 'NOT_FOUND' })
        await checkExperienceModerator(tx, context.locals.user.id, request.commentId)
        await tx.proofRequest.update({ where: { id: input.requestId }, data: { cancelledAt: new Date() } })
        await recordAuditLog(tx, {
          actorId: context.locals.user.id,
          targetType: 'COMMENT',
          targetId: request.commentId,
          action: 'UPDATED',
          summary: 'Cancelled a proof request',
        })
      })
    },
  }),
  dismissNote: defineProtectedAction({
    accept: 'form',
    permissions: cap('comments:moderate'),
    input: z.object({ evidenceId: z.coerce.number().int().positive() }),
    handler: async (input, context) => {
      await prisma.$transaction(async (tx) => {
        await lockProof(tx, input.evidenceId)
        const evidence = await tx.commentEvidence.findUnique({
          where: { id: input.evidenceId },
          select: {
            commentId: true,
            kind: true,
            removedAt: true,
            _count: { select: { checks: true } },
            comment: { select: { _count: { select: { proofRequests: { where: { cancelledAt: null } } } } } },
          },
        })
        if (
          !evidence?.commentId ||
          evidence.removedAt ||
          evidence.kind !== 'NOTE' ||
          evidence._count.checks
        ) {
          throw new ActionError({ code: 'BAD_REQUEST', message: 'Only an unchecked note can be cleared.' })
        }
        // A note may answer a proof request, so it gets a recorded result the author can see instead.
        if (evidence.comment?._count.proofRequests) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: 'This post has a proof request. Publish a result for the note instead.',
          })
        }
        await checkExperienceModerator(tx, context.locals.user.id, evidence.commentId)
        await tx.commentEvidence.update({ where: { id: input.evidenceId }, data: { needsCheck: false } })
        await recordAuditLog(tx, {
          actorId: context.locals.user.id,
          targetType: 'COMMENT',
          targetId: evidence.commentId,
          action: 'UPDATED',
          summary: 'Cleared a note that holds no proof',
        })
        await publishIfHeldOnlyForProof(tx, evidence.commentId, context.locals.user.id)
      })
    },
  }),
  linkCase: defineProtectedAction({
    accept: 'form',
    permissions: cap('cases:manage'),
    input: z.object({
      commentId,
      caseId: z.preprocess(
        (value) => (value === '' ? undefined : value),
        z.coerce.number().int().positive().optional()
      ),
    }),
    handler: async (input, context) => {
      if (!userCan(context.locals.user, 'comments:moderate')) throw new ActionError({ code: 'FORBIDDEN' })
      return prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Comment" WHERE id = ${input.commentId} FOR UPDATE`
        const comment = await checkExperienceModerator(tx, context.locals.user.id, input.commentId)
        const source = await tx.comment.findUniqueOrThrow({
          where: { id: comment.id },
          select: { kind: true, content: true, service: { select: { name: true, slug: true } } },
        })
        if (source.kind !== 'EXPERIENCE') {
          throw new ActionError({ code: 'BAD_REQUEST', message: 'Cases must link to an experience.' })
        }
        const alreadyLinked = await tx.case.findFirst({
          where: { sourceCommentId: comment.id },
          select: { id: true },
        })
        let caseRecord
        if (input.caseId) {
          if (alreadyLinked && alreadyLinked.id !== input.caseId) {
            throw new ActionError({
              code: 'CONFLICT',
              message: 'This post is already linked to another case.',
            })
          }
          await tx.$queryRaw`SELECT id FROM "Case" WHERE id = ${input.caseId} FOR UPDATE`
          const existing = await tx.case.findUnique({
            where: { id: input.caseId },
            select: { serviceId: true, sourceCommentId: true },
          })
          if (
            existing?.serviceId !== comment.serviceId ||
            (existing.sourceCommentId && existing.sourceCommentId !== comment.id)
          ) {
            throw new ActionError({
              code: 'BAD_REQUEST',
              message: 'Choose an unlinked case for the same service.',
            })
          }
          caseRecord = await tx.case.update({
            where: { id: input.caseId },
            data: { sourceCommentId: comment.id },
            select: { id: true },
          })
        } else {
          if (alreadyLinked) return { case: alreadyLinked }
          caseRecord = await tx.case.create({
            data: {
              sourceCommentId: comment.id,
              serviceId: comment.serviceId,
              reportedById: comment.authorId,
              createdById: context.locals.user.id,
              title: `Report about ${source.service.name}`,
              issueType: 'OTHER',
              status: 'DRAFT',
              summaryMd: source.content,
              externalSource: absoluteSiteUrl(
                `/service/${source.service.slug}?comment=${comment.id.toString()}`
              ),
            },
            select: { id: true },
          })
        }
        await recordAuditLog(tx, {
          actorId: context.locals.user.id,
          targetType: 'COMMENT',
          targetId: comment.id,
          action: 'UPDATED',
          summary: `Linked case ${caseRecord.id.toString()}; no private evidence shared`,
        })
        return { case: caseRecord }
      })
    },
  }),
}
