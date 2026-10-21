import { CommentKind, SentimentSource } from '@prisma/client'
import { z } from 'astro/zod'
import { ActionError } from 'astro:actions'
import { formatDistanceStrict } from 'date-fns'

import { commentIssueTypesZodEnumByValue } from '../constants/commentIssueTypes'
import { withEvidenceImage } from '../lib/commentEvidence'
import { POST_LENGTH, postContentSchema } from '../lib/commentLimits'
import { validateCommentTimestamp } from '../lib/commentSubmission'
import { defineProtectedAction } from '../lib/defineProtectedAction'
import {
  experienceInput,
  isPublishedComment,
  isServicePubliclyReadable,
  outcomeForProblems,
  issuesNeedingProof,
  proofRequiredMessage,
} from '../lib/experiences'
import { getOrCreateNotificationPreferences } from '../lib/notificationPreferences'
import { prisma } from '../lib/prisma'
import { classifyProof } from '../lib/proofEvidence'
import { handleHoneypotTrap, handleXSSDetection } from '../lib/spamDetection'
import { commentsDisabledMessage } from '../lib/trust'
import { formCheckbox, imageFileSchema } from '../lib/zodUtils'

import type { Prisma } from '@prisma/client'

const COMMENT_RATE_LIMIT_WINDOW_MINUTES = 2
const MAX_COMMENTS_PER_WINDOW = 1
const MAX_COMMENTS_PER_WINDOW_VERIFIED_USER = 10
const COMMENT_ORDER_ID_MAX_LENGTH = 100

export const commentActions = {
  create: defineProtectedAction({
    accept: 'form',
    permissions: 'user',
    input: z
      .object({
        ...experienceInput.shape,
        content: postContentSchema,
        serviceId: z.coerce.number().int().positive(),
        parentId: z.coerce.number().int().positive().optional(),
        /** @deprecated Honey pot field, do not use */
        message: z.unknown().optional(),

        encTimestamp: z.string().min(1), // time trap field
        issues: z.array(commentIssueTypesZodEnumByValue).default([]),
        noProblems: formCheckbox,
        resolvedSince: formCheckbox,
        orderId: z.string().max(COMMENT_ORDER_ID_MAX_LENGTH).optional(),
        proofImage: imageFileSchema,
      })
      .superRefine((data, ctx) => {
        if (!data.parentId) {
          if (data.content.length < POST_LENGTH.rootMin) {
            ctx.addIssue({
              code: z.ZodIssueCode.too_small,
              minimum: POST_LENGTH.rootMin,
              type: 'string',
              inclusive: true,
              path: ['content'],
              message: `Content must be at least ${String(POST_LENGTH.rootMin)} characters`,
            })
          }
          const hasProof = !!data.orderId?.trim() || !!data.proofImage
          if (!hasProof && issuesNeedingProof(data.issues).length > 0) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['orderId'], message: proofRequiredMessage })
          }
        }
      }),
    handler: async (input, context) => {
      if (context.locals.user.trust.commentsDisabled) {
        throw new ActionError({ code: 'FORBIDDEN', message: commentsDisabledMessage })
      }
      if (!input.parentId && !input.sentiment) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'Pick how it went: positive, mixed or negative.',
        })
      }

      await handleHoneypotTrap({
        input,
        honeyPotTrapField: 'message',
        userId: context.locals.user.id,
        location: 'comment.create',
      })

      await handleXSSDetection({
        input,
        contentField: 'content',
        userId: context.locals.user.id,
        location: `service with id ${input.serviceId.toString()}`,
        dontMarkAsSpammer: context.locals.user.admin,
      })

      validateCommentTimestamp(input.encTimestamp)

      const isVerifiedUser = context.locals.user.admin || context.locals.user.verified
      const maxCommentsPerWindow = isVerifiedUser
        ? MAX_COMMENTS_PER_WINDOW_VERIFIED_USER
        : MAX_COMMENTS_PER_WINDOW

      const windowStart = new Date(Date.now() - COMMENT_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000)
      const recentCommentCount = await prisma.comment.findMany({
        where: {
          authorId: context.locals.user.id,
          createdAt: {
            gte: windowStart,
          },
        },
        select: {
          id: true,
          createdAt: true,
        },
      })

      if (recentCommentCount.length >= maxCommentsPerWindow) {
        const oldestCreatedAt = recentCommentCount.reduce<Date | null>((oldestDate, comment) => {
          if (!oldestDate) return comment.createdAt
          if (comment.createdAt < oldestDate) return comment.createdAt
          return oldestDate
        }, null)

        console.warn(`Rate limit exceeded for user ${context.locals.user.id.toLocaleString()}`)
        throw new ActionError({
          code: 'TOO_MANY_REQUESTS',
          message: `Rate limit exceeded. Please wait ${oldestCreatedAt ? `${formatDistanceStrict(oldestCreatedAt, windowStart)} ` : ''}before commenting again.`,
        })
      }

      // Checked before a proof image is decoded, then again inside the transaction.
      const targetService = await prisma.service.findUnique({
        where: { id: input.serviceId },
        select: { serviceVisibility: true },
      })
      if (!targetService || !isServicePubliclyReadable(targetService.serviceVisibility)) {
        throw new ActionError({ code: 'NOT_FOUND' })
      }

      const issueTypes = !input.parentId ? [...new Set(input.issues)] : []

      const attachesProof = !input.parentId
      const proofImage = attachesProof && !context.locals.user.spammer ? input.proofImage : undefined
      // Comment moderators are trusted: their posts skip the queue and publish as their own decision.
      const publishesDirectly = context.locals.userCan('comments:moderate')
      // A service's team answering on its own page publishes at once; reports still reach moderators.
      const repliesForService =
        !publishesDirectly &&
        !!input.parentId &&
        (await prisma.serviceUser.count({
          where: { userId: context.locals.user.id, serviceId: input.serviceId },
        })) > 0
      const created = { updatesVerdict: false }
      const hasProof = attachesProof && (!!input.orderId?.trim() || !!proofImage)
      const waitsForProofCheck = !publishesDirectly && hasProof && issuesNeedingProof(issueTypes).length > 0
      try {
        await withEvidenceImage(proofImage, (proofImagePath) =>
          prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${context.locals.user.id} FOR UPDATE`
            const recentCount = await tx.comment.count({
              where: { authorId: context.locals.user.id, createdAt: { gte: windowStart } },
            })
            if (recentCount >= maxCommentsPerWindow) {
              throw new ActionError({
                code: 'TOO_MANY_REQUESTS',
                message: 'Rate limit exceeded. Please wait before commenting again.',
              })
            }
            const service = await tx.service.findUnique({
              where: { id: input.serviceId },
              select: { id: true, serviceVisibility: true, proofLookupUrl: true, proofIdPattern: true },
            })
            if (!service || !isServicePubliclyReadable(service.serviceVisibility)) {
              throw new ActionError({ code: 'NOT_FOUND' })
            }
            const thread = input.parentId
              ? await tx.comment.findUnique({
                  where: { id: input.parentId },
                  select: {
                    id: true,
                    parentId: true,
                    serviceId: true,
                    status: true,
                    authorId: true,
                    kind: true,
                    experience: { select: { id: true } },
                  },
                })
              : null
            if (
              input.parentId &&
              (thread?.serviceId !== input.serviceId || !isPublishedComment(thread.status))
            ) {
              throw new ActionError({
                code: 'BAD_REQUEST',
                message: 'Reply to a published comment on this service.',
              })
            }
            const rootId = thread ? (thread.parentId ?? thread.id) : null
            const replyToId = thread?.parentId ? thread.id : null
            if (rootId && rootId !== thread?.id) {
              const root = await tx.comment.findUnique({ where: { id: rootId }, select: { status: true } })
              if (!root || !isPublishedComment(root.status)) {
                throw new ActionError({
                  code: 'BAD_REQUEST',
                  message: 'Reply to a published comment on this service.',
                })
              }
            }
            const commentData: Prisma.CommentCreateInput = {
              content: input.content,
              service: { connect: { id: input.serviceId } },
              author: { connect: { id: context.locals.user.id } },
              status: 'PENDING',
              kind: input.parentId ? CommentKind.DISCUSSION : CommentKind.EXPERIENCE,
              issues: issueTypes,
            }

            // A direct reply to your own experience may change its verdict; it then counts as an update.
            const ownExperienceId =
              thread &&
              !thread.parentId &&
              thread.authorId === context.locals.user.id &&
              thread.kind === 'EXPERIENCE'
                ? thread.experience?.id
                : undefined
            if (ownExperienceId && (input.sentiment || input.outcome !== 'UNSPECIFIED')) {
              created.updatesVerdict = true
              commentData.experienceUpdate = {
                create: {
                  experienceId: ownExperienceId,
                  sentiment: input.sentiment ?? null,
                  outcome: input.outcome === 'UNSPECIFIED' ? null : input.outcome,
                },
              }
            }

            if (rootId) commentData.parent = { connect: { id: rootId } }
            if (replyToId) commentData.replyTo = { connect: { id: replyToId } }

            if (!input.parentId) {
              commentData.experience = {
                create: {
                  occurredMonth: input.occurredMonth,
                  sentiment: input.sentiment,
                  sentimentSource: input.sentiment ? SentimentSource.AUTHOR : undefined,
                  outcome: outcomeForProblems({
                    noProblems: input.noProblems,
                    issues: issueTypes,
                    resolved: input.resolvedSince,
                  }),
                },
              }
            }

            const newComment = await tx.comment.create({
              data: commentData,
            })

            const notiPref = await getOrCreateNotificationPreferences(
              context.locals.user.id,
              { enableAutowatchMyComments: true },
              tx
            )

            if (notiPref.enableAutowatchMyComments) {
              await tx.notificationPreferences.update({
                where: { userId: context.locals.user.id },
                data: {
                  watchedComments: { connect: { id: newComment.id } },
                },
              })
            }

            const proofText = input.orderId?.trim()
            if (attachesProof && (proofText || proofImagePath)) {
              await tx.commentEvidence.create({
                data: {
                  commentId: newComment.id,
                  authorId: context.locals.user.id,
                  body: proofText || null,
                  imagePath: proofImagePath,
                  ...classifyProof(proofText, !!proofImagePath, service),
                },
              })
            }

            if (publishesDirectly || repliesForService) {
              await tx.comment.update({
                where: { id: newComment.id },
                data: {
                  status: 'APPROVED',
                  humanAction: 'APPROVE',
                  humanDecidedAt: new Date(),
                  humanDecidedById: publishesDirectly ? context.locals.user.id : null,
                  humanReasoning: repliesForService ? "Reply from the service's team" : undefined,
                },
              })
            }
          })
        )
      } catch (error) {
        if (error instanceof ActionError) throw error

        console.error('Error creating comment:', error)
        throw new ActionError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error creating comment',
        })
      }
      return {
        hasProof,
        waitsForProofCheck,
        awaitsVerdictReview: created.updatesVerdict && !publishesDirectly,
      }
    },
  }),
}
