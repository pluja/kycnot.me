import {
  CommentKind,
  CommentStatus,
  ContactCategory,
  ExperienceOutcome,
  SentimentSource,
} from '@prisma/client'
import { z } from 'astro/zod'
import { ActionError } from 'astro:actions'
import { subDays } from 'date-fns'

import { commentRulesZodEnumByValue, getCommentRuleInfo } from '../constants/commentRules'
import { moderatorTodoReasons } from '../lib/adminCommentReview'
import { recordAuditLog } from '../lib/auditLog'
import { withEvidenceImage } from '../lib/commentEvidence'
import { cleanupCommentEvidenceFiles } from '../lib/commentEvidenceCleanup'
import { POST_LENGTH, REPORT_MESSAGE_LENGTH } from '../lib/commentLimits'
import { latestCheckSelect } from '../lib/commentPage'
import { classifyCommentProof } from '../lib/commentProof'
import { validateCommentTimestamp } from '../lib/commentSubmission'
import { applyCommentRevision } from '../lib/dbFunctions'
import { defineProtectedAction } from '../lib/defineProtectedAction'
import { publicEvidenceSelect, summaryWindowDays } from '../lib/experienceQueries'
import {
  experienceInput,
  isPublishedComment,
  isServicePubliclyReadable,
  editedOutcome,
  revisionInput,
  issuesNeedingProof,
} from '../lib/experiences'
import { prisma } from '../lib/prisma'
import { checkedProofStaysMessage, countsAsProof, summarizeProof } from '../lib/proofEvidence'
import { createProofRequest, MAX_DISPUTES_PER_SERVICE_PER_WEEK } from '../lib/proofRequests'
import { handleHoneypotTrap, handleXSSDetection } from '../lib/spamDetection'
import { commentsDisabledMessage } from '../lib/trust'
import { restoredStatus, withdrawableStatuses } from '../lib/withdrawal'
import { imageFileSchema } from '../lib/zodUtils'

import { CONTACT_MAX_PER_USER_PER_DAY } from './contact'

const idInput = z.object({ commentId: z.coerce.number().int().positive() })

// checkProofTarget refuses proof the author can't send, and returns the post's current proof, which new proof replaces.
async function checkProofTarget(
  db: Pick<typeof prisma, 'comment' | 'commentEvidence'>,
  commentId: number,
  userId: number
) {
  const comment = await db.comment.findUnique({
    where: { id: commentId },
    select: {
      authorId: true,
      kind: true,
      status: true,
      serviceId: true,
      service: { select: { serviceVisibility: true } },
    },
  })
  // Proof goes to live posts on a service readers can open; rejected or withdrawn posts take none.
  if (
    comment?.authorId !== userId ||
    comment.kind !== 'EXPERIENCE' ||
    !(comment.status === 'APPROVED' || comment.status === 'PENDING') ||
    !isServicePubliclyReadable(comment.service.serviceVisibility)
  ) {
    throw new ActionError({ code: 'NOT_FOUND' })
  }
  const current = await db.commentEvidence.findFirst({
    where: { commentId, removedAt: null },
    select: {
      id: true,
      removedAt: true,
      legacyStatus: true,
      checks: latestCheckSelect,
    },
  })
  if (current && countsAsProof(current)) {
    throw new ActionError({ code: 'BAD_REQUEST', message: checkedProofStaysMessage })
  }
  const sentToday = await db.commentEvidence.count({
    where: { authorId: userId, createdAt: { gte: subDays(new Date(), 1) } },
  })
  if (sentToday >= 10) {
    throw new ActionError({ code: 'TOO_MANY_REQUESTS', message: 'You can send proof up to ten times a day.' })
  }
  return { serviceId: comment.serviceId, current }
}

export const experienceActions = {
  edit: defineProtectedAction({
    accept: 'form',
    permissions: 'user',
    input: revisionInput,
    handler: async (input, context) => {
      if (context.locals.user.trust.commentsDisabled) {
        throw new ActionError({ code: 'FORBIDDEN', message: commentsDisabledMessage })
      }
      validateCommentTimestamp(input.encTimestamp)
      await handleHoneypotTrap({
        input,
        honeyPotTrapField: 'message',
        userId: context.locals.user.id,
        location: 'experience',
      })
      await handleXSSDetection({
        input,
        contentField: 'content',
        userId: context.locals.user.id,
        location: 'experience.edit',
      })
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Comment" WHERE id = ${input.commentId} FOR UPDATE`
        const comment = await tx.comment.findUnique({
          where: { id: input.commentId },
          select: {
            authorId: true,
            version: true,
            parentId: true,
            kind: true,
            status: true,
            service: { select: { serviceVisibility: true } },
            issues: true,
            experience: { select: { outcome: true, sentiment: true, sentimentSource: true } },
            experienceUpdate: { select: { id: true } },
            _count: { select: { evidence: { where: { removedAt: null } } } },
          },
        })
        if (comment?.authorId !== context.locals.user.id) {
          throw new ActionError({ code: 'NOT_FOUND' })
        }
        if (comment.version !== input.version) {
          throw new ActionError({ code: 'CONFLICT', message: 'This post changed. Reload before editing.' })
        }
        if (!isServicePubliclyReadable(comment.service.serviceVisibility)) {
          throw new ActionError({ code: 'NOT_FOUND' })
        }
        if (!isPublishedComment(comment.status)) {
          throw new ActionError({ code: 'BAD_REQUEST', message: 'Only published posts can be revised.' })
        }
        if (comment.experienceUpdate) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: 'Add another update to correct this update.',
          })
        }
        if (!comment.parentId && input.content.length < POST_LENGTH.rootMin) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: `Write at least ${String(POST_LENGTH.rootMin)} characters.`,
          })
        }
        if (comment.kind === 'EXPERIENCE' && input.kind !== 'EXPERIENCE') {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: 'An experience keeps its history. Edit its details or add an update.',
          })
        }
        const pending = await tx.commentRevision.count({
          where: { commentId: input.commentId, status: 'PENDING' },
        })
        if (pending) {
          throw new ActionError({ code: 'CONFLICT', message: 'An edit is already waiting for review.' })
        }
        const kind = comment.parentId ? CommentKind.DISCUSSION : input.kind
        const issues = [...new Set(input.issues)]
        const addedNeedingProof = issuesNeedingProof(issues).filter(
          (issue) => !comment.issues.includes(issue)
        )
        if (addedNeedingProof.length > 0 && !comment._count.evidence) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: 'Reporting a KYC request or held funds needs proof. Add it in the Proof tab first.',
          })
        }
        const details = {
          ...experienceInput.parse(input),
          outcome: editedOutcome(
            { issues: comment.issues, outcome: comment.experience?.outcome ?? ExperienceOutcome.UNSPECIFIED },
            { noProblems: input.noProblems, issues, resolved: input.resolvedSince }
          ),
        }
        await tx.commentRevision.create({
          data: {
            commentId: input.commentId,
            authorId: context.locals.user.id,
            baseVersion: input.version,
            content: input.content,
            kind,
            ...(kind === 'EXPERIENCE'
              ? {
                  experienceData: {
                    ...details,
                    issues,
                    // The form re-sends the current sentiment; only a new one becomes the author's.
                    sentimentSource: !details.sentiment
                      ? null
                      : details.sentiment === comment.experience?.sentiment
                        ? (comment.experience.sentimentSource ?? SentimentSource.AUTHOR)
                        : SentimentSource.AUTHOR,
                  },
                }
              : {}),
          },
        })
        await recordAuditLog(tx, {
          actorId: context.locals.user.id,
          action: 'CREATED',
          targetType: 'COMMENT',
          targetId: input.commentId,
          summary: 'Submitted an edit for moderation',
        })
      })
    },
  }),
  addEvidence: defineProtectedAction({
    accept: 'form',
    permissions: 'user',
    input: idInput.extend({ body: z.string().trim().max(4000).optional(), imageFile: imageFileSchema }),
    handler: async (input, context) => {
      if (context.locals.user.trust.commentsDisabled) {
        throw new ActionError({ code: 'FORBIDDEN', message: commentsDisabledMessage })
      }
      if (!input.body && !input.imageFile) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Add a reference, explanation or image.' })
      }
      // The checks run before the image is decoded, then again under the locks.
      await checkProofTarget(prisma, input.commentId, context.locals.user.id)
      await withEvidenceImage(input.imageFile, (imagePath) =>
        prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${context.locals.user.id} FOR UPDATE`
          await tx.$queryRaw`SELECT id FROM "Comment" WHERE id = ${input.commentId} FOR UPDATE`
          const { serviceId, current } = await checkProofTarget(tx, input.commentId, context.locals.user.id)
          if (current) {
            await tx.commentEvidence.update({ where: { id: current.id }, data: { removedAt: new Date() } })
          }
          await tx.commentEvidence.create({
            data: {
              commentId: input.commentId,
              authorId: context.locals.user.id,
              body: input.body || null,
              imagePath,
              ...(await classifyCommentProof(tx, serviceId, input.body, !!imagePath)),
            },
          })
          await recordAuditLog(tx, {
            actorId: context.locals.user.id,
            action: 'CREATED',
            targetType: 'COMMENT',
            targetId: input.commentId,
            summary: current ? 'Replaced private proof' : 'Added private proof',
          })
        })
      )
      await cleanupCommentEvidenceFiles()
    },
  }),
  removeEvidence: defineProtectedAction({
    accept: 'form',
    permissions: 'authenticated',
    input: z.object({ evidenceId: z.coerce.number().int().positive() }),
    handler: async (input, context) => {
      await prisma.$transaction(async (tx) => {
        // The lock keeps a moderator's check from landing between this read and the removal.
        await tx.$queryRaw`SELECT id FROM "CommentEvidence" WHERE id = ${input.evidenceId} FOR UPDATE`
        const evidence = await tx.commentEvidence.findUnique({
          where: { id: input.evidenceId },
          select: {
            authorId: true,
            commentId: true,
            removedAt: true,
            legacyStatus: true,
            checks: latestCheckSelect,
          },
        })
        if (evidence?.authorId !== context.locals.user.id) {
          throw new ActionError({ code: 'NOT_FOUND' })
        }
        if (evidence.removedAt) return
        if (countsAsProof(evidence)) {
          throw new ActionError({ code: 'BAD_REQUEST', message: checkedProofStaysMessage })
        }
        await tx.commentEvidence.update({ where: { id: input.evidenceId }, data: { removedAt: new Date() } })
        if (evidence.commentId) {
          await recordAuditLog(tx, {
            actorId: context.locals.user.id,
            action: 'DELETED',
            targetType: 'COMMENT',
            targetId: evidence.commentId,
            summary: 'Author removed their proof; check history retained',
          })
        }
      })
      await cleanupCommentEvidenceFiles()
    },
  }),
  report: defineProtectedAction({
    accept: 'form',
    permissions: 'not-spammer',
    input: idInput.extend({
      reason: commentRulesZodEnumByValue.refine(
        (rule) => getCommentRuleInfo(rule).reportable,
        'Choose one of the listed reasons.'
      ),
      message: z.string().trim().min(REPORT_MESSAGE_LENGTH.min).max(REPORT_MESSAGE_LENGTH.max),
    }),
    handler: async (input, context) => {
      return prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${context.locals.user.id} FOR UPDATE`
        await tx.$queryRaw`SELECT id FROM "Comment" WHERE id = ${input.commentId} FOR UPDATE`
        const comment = await tx.comment.findUnique({
          where: { id: input.commentId },
          select: {
            authorId: true,
            status: true,
            serviceId: true,
            parentId: true,
            kind: true,
            issues: true,
            experience: { select: { sentiment: true } },
            evidence: { select: publicEvidenceSelect },
            createdAt: true,
            proofRequests: {
              where: { OR: [{ source: 'SERVICE' }, { cancelledAt: null }] },
              select: { id: true },
            },
            service: { select: { serviceVisibility: true } },
          },
        })
        if (
          !comment ||
          !isPublishedComment(comment.status) ||
          !isServicePubliclyReadable(comment.service.serviceVisibility)
        ) {
          throw new ActionError({ code: 'NOT_FOUND' })
        }
        if (comment.authorId === context.locals.user.id) {
          throw new ActionError({ code: 'BAD_REQUEST', message: 'You cannot report your own post.' })
        }
        const recent = await tx.contactThread.count({
          where: { authorId: context.locals.user.id, createdAt: { gte: subDays(new Date(), 1) } },
        })
        const open = await tx.contactThread.count({
          where: {
            authorId: context.locals.user.id,
            commentId: input.commentId,
            status: { not: 'RESOLVED' },
          },
        })
        if (open) {
          throw new ActionError({
            code: 'CONFLICT',
            message: 'You already reported this post. Continue that conversation from your contact page.',
          })
        }
        if (recent >= CONTACT_MAX_PER_USER_PER_DAY) {
          throw new ActionError({
            code: 'TOO_MANY_REQUESTS',
            message: `You can send up to ${String(CONTACT_MAX_PER_USER_PER_DAY)} reports or messages a day. Try again tomorrow.`,
          })
        }
        const recentlyDismissed = await tx.contactThread.count({
          where: {
            authorId: context.locals.user.id,
            category: ContactCategory.COMMENT_REPORT,
            reportOutcome: 'NO_ACTION',
            resolvedAt: { gte: subDays(new Date(), 30) },
          },
        })
        if (recentlyDismissed >= 3) {
          throw new ActionError({
            code: 'TOO_MANY_REQUESTS',
            message: 'Several of your recent reports needed no action. You can report again later.',
          })
        }
        const fromService =
          (await tx.serviceUser.count({
            where: { userId: context.locals.user.id, serviceId: comment.serviceId },
          })) > 0
        const thread = await tx.contactThread.create({
          data: {
            authorId: context.locals.user.id,
            commentId: input.commentId,
            category: ContactCategory.COMMENT_REPORT,
            reportReason: input.reason,
            fromService,
            messages: { create: { authorId: context.locals.user.id, content: input.message } },
          },
          select: { id: true },
        })
        // A service disputing a claim it calls not genuine asks the author for proof: once per post, only for posts
        // the summary counts, and a few a week per service. Everything else goes to the moderators only.
        const authorId = comment.authorId
        const disputes =
          authorId !== null &&
          fromService &&
          input.reason === 'NOT_GENUINE' &&
          !comment.parentId &&
          comment.kind === 'EXPERIENCE' &&
          (comment.experience?.sentiment === 'NEGATIVE' || comment.issues.length > 0) &&
          summarizeProof(comment.evidence) === 'none' &&
          comment.proofRequests.length === 0 &&
          comment.createdAt > subDays(new Date(), summaryWindowDays) &&
          (await tx.proofRequest.count({
            where: {
              source: 'SERVICE',
              createdAt: { gte: subDays(new Date(), 7) },
              comment: { serviceId: comment.serviceId },
            },
          })) < MAX_DISPUTES_PER_SERVICE_PER_WEEK
        if (disputes) {
          await createProofRequest(tx, {
            commentId: input.commentId,
            authorId,
            source: 'SERVICE',
            requestedById: context.locals.user.id,
          })
        }
        return { thread }
      })
    },
  }),
  withdraw: defineProtectedAction({
    accept: 'form',
    permissions: 'user',
    input: idInput,
    handler: async (input, context) => {
      const userId = context.locals.user.id
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Comment" WHERE id = ${input.commentId} FOR UPDATE`
        const comment = await tx.comment.findUnique({
          where: { id: input.commentId },
          select: {
            authorId: true,
            status: true,
            parentId: true,
            experienceUpdate: { select: { id: true } },
          },
        })
        if (comment?.authorId !== userId) throw new ActionError({ code: 'NOT_FOUND' })
        // Withdrawing a published update alone would silently bring back the earlier verdict.
        if (comment.experienceUpdate && comment.status === 'APPROVED') {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: 'A published update cannot be withdrawn on its own. Post a new update instead.',
          })
        }
        if (!withdrawableStatuses.includes(comment.status)) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: 'Only published or pending posts can be withdrawn.',
          })
        }
        // The author's own replies and updates in the thread leave with the post. They are locked too, so a
        // moderator's decision on one can't land between reading and withdrawing it.
        if (!comment.parentId) {
          await tx.$queryRaw`SELECT id FROM "Comment" WHERE "parentId" = ${input.commentId} AND "authorId" = ${userId} FOR UPDATE`
        }
        const posts = await tx.comment.findMany({
          where: {
            OR: [
              { id: input.commentId },
              ...(comment.parentId ? [] : [{ parentId: input.commentId, authorId: userId }]),
            ],
            status: { in: withdrawableStatuses },
          },
          select: { id: true, status: true, version: true },
        })
        const ids = posts.map((post) => post.id)
        const now = new Date()
        const waiting = new Set(
          (
            await tx.comment.findMany({
              where: { id: { in: ids }, OR: Object.values(moderatorTodoReasons(now)) },
              select: { id: true },
            })
          ).map((post) => post.id)
        )
        for (const post of posts) {
          await tx.comment.update({
            where: { id: post.id },
            data: {
              status: CommentStatus.WITHDRAWN,
              // A post a moderator still had to look at goes back to review when restored, so withdrawing can't
              // shed a report or a proof check.
              statusBeforeWithdrawal: waiting.has(post.id) ? CommentStatus.PENDING : post.status,
              withdrawnAt: now,
              withdrawnVersion: post.version,
              ...(waiting.has(post.id) ? { withdrawnWhileWaiting: true } : {}),
            },
          })
        }
        await tx.contactThread.updateMany({
          where: {
            commentId: { in: ids },
            category: ContactCategory.COMMENT_REPORT,
            status: { not: 'RESOLVED' },
          },
          data: {
            status: 'RESOLVED',
            resolvedAt: now,
            reportOutcome: 'WITHDRAWN',
          },
        })
        const pendingEdits = await tx.commentRevision.findMany({
          where: { commentId: { in: ids }, status: 'PENDING' },
          select: { id: true },
        })
        for (const edit of pendingEdits) {
          await applyCommentRevision(tx, {
            revisionId: edit.id,
            approve: false,
            decidedById: userId,
            reason: 'Withdrawn by the author.',
          })
        }
        await recordAuditLog(tx, {
          actorId: userId,
          action: 'STATUS_CHANGED',
          targetType: 'COMMENT',
          targetId: input.commentId,
          summary: `Withdrawn by the author${waiting.size ? ' while waiting for a moderator' : ''}`,
        })
      })
    },
  }),
  restore: defineProtectedAction({
    accept: 'form',
    permissions: 'user',
    input: idInput,
    handler: async (input, context) => {
      const userId = context.locals.user.id
      if (context.locals.user.trust.commentsDisabled) {
        throw new ActionError({ code: 'FORBIDDEN', message: commentsDisabledMessage })
      }
      return prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Comment" WHERE id = ${input.commentId} FOR UPDATE`
        const comment = await tx.comment.findUnique({
          where: { id: input.commentId },
          select: { authorId: true, parentId: true, withdrawnAt: true, parent: { select: { status: true } } },
        })
        if (comment?.authorId !== userId || !comment.withdrawnAt) throw new ActionError({ code: 'NOT_FOUND' })
        if (comment.parent && !isPublishedComment(comment.parent.status)) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: 'The post this reply belongs to is no longer published.',
          })
        }
        if (!comment.parentId) {
          await tx.$queryRaw`SELECT id FROM "Comment" WHERE "parentId" = ${input.commentId} AND "authorId" = ${userId} FOR UPDATE`
        }
        const posts = await tx.comment.findMany({
          where: {
            OR: [
              { id: input.commentId },
              ...(comment.parentId
                ? []
                : [{ parentId: input.commentId, authorId: userId, withdrawnAt: comment.withdrawnAt }]),
            ],
            status: 'WITHDRAWN',
          },
          select: {
            id: true,
            status: true,
            statusBeforeWithdrawal: true,
            version: true,
            withdrawnVersion: true,
            humanAction: true,
          },
        })
        let restored: CommentStatus | null = null
        for (const post of posts) {
          const status = restoredStatus(post)
          if (!status) continue
          if (post.id === input.commentId) restored = status
          await tx.comment.update({
            where: { id: post.id },
            data: {
              status,
              statusBeforeWithdrawal: null,
              withdrawnAt: null,
              withdrawnVersion: null,
              // A published post that changed while withdrawn is moderated again from the start. Any other post
              // going back to review drops a past approve or reject, which would otherwise mark it resolved and
              // keep it out of every queue.
              ...(status === CommentStatus.PENDING && post.statusBeforeWithdrawal === CommentStatus.APPROVED
                ? { aiAction: null, aiDecidedAt: null, humanAction: null }
                : status === CommentStatus.PENDING &&
                    (post.humanAction === 'APPROVE' || post.humanAction === 'REJECT')
                  ? { humanAction: null }
                  : {}),
            },
          })
        }
        if (!restored) {
          throw new ActionError({ code: 'BAD_REQUEST', message: 'This post cannot be restored.' })
        }
        await recordAuditLog(tx, {
          actorId: userId,
          action: 'STATUS_CHANGED',
          targetType: 'COMMENT',
          targetId: input.commentId,
          summary: `Restored by the author as ${restored}`,
        })
        return { restored }
      })
    },
  }),
}
