import crypto from 'crypto'

import { z } from 'astro/zod'
import { ActionError } from 'astro:actions'
import { formatDistanceStrict } from 'date-fns'

import { karmaUnlocksById } from '../constants/karmaUnlocks'
import { defineProtectedAction } from '../lib/defineProtectedAction'
import { makeKarmaUnlockMessage } from '../lib/karmaUnlocks'
import { getOrCreateNotificationPreferences } from '../lib/notificationPreferences'
import { cap, userCan } from '../lib/permissions'
import { prisma } from '../lib/prisma'
import { handleHoneypotTrap, handleXSSDetection } from '../lib/spamDetection'
import { timeTrapSecretKey } from '../lib/timeTrapSecret'

import type { CommentStatus, Prisma } from '@prisma/client'

const COMMENT_RATE_LIMIT_WINDOW_MINUTES = 2
const MAX_COMMENTS_PER_WINDOW = 1
const MAX_COMMENTS_PER_WINDOW_VERIFIED_USER = 10
export const COMMENT_ORDER_ID_MAX_LENGTH = 100

const activeRatingStatuses = ['APPROVED', 'VERIFIED'] satisfies CommentStatus[]

type RefreshActiveRatingOptions = {
  preferredCommentId?: number
}

type CommentRatingTransaction = Pick<typeof prisma, 'comment'>

function isActiveRatingStatus(status: CommentStatus) {
  return status === 'APPROVED' || status === 'VERIFIED'
}

async function refreshActiveRatingForUserService(
  tx: CommentRatingTransaction,
  authorId: number,
  serviceId: number,
  options: RefreshActiveRatingOptions = {}
) {
  const activeRatingWhere = {
    authorId,
    serviceId,
    rating: { not: null },
    parentId: null,
    status: { in: activeRatingStatuses },
    ratingMuted: false,
  } satisfies Prisma.CommentWhereInput

  const preferredRating = options.preferredCommentId
    ? await tx.comment.findFirst({
        where: {
          ...activeRatingWhere,
          id: options.preferredCommentId,
        },
        select: {
          id: true,
          ratingActive: true,
        },
      })
    : null

  const ratingToActivate =
    preferredRating ??
    (await tx.comment.findFirst({
      where: activeRatingWhere,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        ratingActive: true,
      },
    }))

  await tx.comment.updateMany({
    where: {
      authorId,
      serviceId,
      rating: { not: null },
      parentId: null,
      ratingActive: true,
      ...(ratingToActivate ? { id: { not: ratingToActivate.id } } : {}),
    },
    data: {
      ratingActive: false,
    },
  })

  if (ratingToActivate && !ratingToActivate.ratingActive) {
    await tx.comment.update({
      where: { id: ratingToActivate.id },
      data: {
        ratingActive: true,
      },
    })
  }
}

export const commentActions = {
  vote: defineProtectedAction({
    accept: 'form',
    permissions: 'user',
    input: z.object({
      commentId: z.coerce.number().int().positive(),
      downvote: z.coerce.boolean(),
    }),
    handler: async (input, context) => {
      try {
        // Check user karma requirement
        if (!context.locals.user.karmaUnlocks.voteComments) {
          throw new ActionError({
            code: 'FORBIDDEN',
            message: makeKarmaUnlockMessage(karmaUnlocksById.voteComments),
          })
        }

        // Handle the vote in a transaction
        await prisma.$transaction(async (tx) => {
          // Get existing vote if any
          const existingVote = await tx.commentVote.findUnique({
            where: {
              commentId_userId: {
                commentId: input.commentId,
                userId: context.locals.user.id,
              },
            },
          })

          if (existingVote) {
            // If vote type is the same, remove the vote
            if (existingVote.downvote === input.downvote) {
              await tx.commentVote.delete({
                where: { id: existingVote.id },
              })
            } else {
              // If vote type is different, update the vote
              await tx.commentVote.update({
                where: { id: existingVote.id },
                data: { downvote: input.downvote },
              })
            }
          } else {
            // Create new vote
            await tx.commentVote.create({
              data: {
                downvote: input.downvote,
                commentId: input.commentId,
                userId: context.locals.user.id,
              },
            })
          }
        })

        return true
      } catch (error) {
        if (error instanceof ActionError) throw error

        console.error('Error voting on comment:', error)
        throw new ActionError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error voting on comment',
        })
      }
    },
  }),

  create: defineProtectedAction({
    accept: 'form',
    permissions: 'user',
    input: z
      .object({
        content: z.string().min(10).max(2000),
        serviceId: z.coerce.number().int().positive(),
        parentId: z.coerce.number().optional(),
        /** @deprecated Honey pot field, do not use */
        message: z.unknown().optional(),
        rating: z.coerce.number().int().min(1).max(5).optional(),
        encTimestamp: z.string().min(1), // time trap field
        internalNote: z.string().max(500).optional(),
        issueKycRequested: z.coerce.boolean().optional(),
        issueFundsBlocked: z.coerce.boolean().optional(),
        issueScam: z.coerce.boolean().optional(),
        issueDetails: z.string().max(120).optional(),
        orderId: z.string().max(COMMENT_ORDER_ID_MAX_LENGTH).optional(),
      })
      .superRefine((data, ctx) => {
        if (data.rating && data.parentId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['parentId'],
            message: 'Ratings cannot be provided for replies',
          })
        }
        if (!data.parentId) {
          if (data.content.length < 30) {
            ctx.addIssue({
              code: z.ZodIssueCode.too_small,
              minimum: 30,
              type: 'string',
              inclusive: true,
              path: ['content'],
              message: 'Content must be at least 30 characters',
            })
          }
        }
      }),
    handler: async (input, context) => {
      if (context.locals.user.karmaUnlocks.commentsDisabled) {
        throw new ActionError({
          code: 'FORBIDDEN',
          message: makeKarmaUnlockMessage(karmaUnlocksById.commentsDisabled),
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

      // --- Time Trap Validation Start ---
      try {
        const algorithm = 'aes-256-cbc'
        const decodedValue = Buffer.from(input.encTimestamp, 'base64').toString('utf8')
        const [ivHex, encryptedHex] = decodedValue.split(':')

        if (!ivHex || !encryptedHex) {
          throw new Error('Invalid time trap format.')
        }

        const iv = Buffer.from(ivHex, 'hex')
        const decipher = crypto.createDecipheriv(algorithm, timeTrapSecretKey, iv)
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
        decrypted += decipher.final('utf8')

        const originalTimestamp = parseInt(decrypted, 10)
        if (isNaN(originalTimestamp)) {
          throw new Error('Invalid timestamp data.')
        }

        const now = Date.now()
        const timeDiff = now - originalTimestamp
        const minTimeSeconds = 2 // 2 seconds
        const maxTimeMinutes = 60 // 1 hour

        if (timeDiff < minTimeSeconds * 1000 || timeDiff > maxTimeMinutes * 60 * 1000) {
          console.warn(`Time trap triggered: ${(timeDiff / 1000).toLocaleString()}s`)
          throw new Error('Invalid submission timing.')
        }
      } catch (err) {
        console.warn('Time trap validation failed:', err instanceof Error ? err.message : 'Unknown error')
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'Invalid request',
        })
      }
      // --- Time Trap Validation End ---

      // --- Rate Limit Check Start ---
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
          code: 'TOO_MANY_REQUESTS', // Use specific 429 code
          message: `Rate limit exceeded. Please wait ${oldestCreatedAt ? `${formatDistanceStrict(oldestCreatedAt, windowStart)} ` : ''}before commenting again.`,
        })
      }
      // --- Rate Limit Check End ---

      // --- Issue tags and admin-only note from user submission ---
      const issueTypes: ('FUNDS_BLOCKED' | 'KYC_REQUESTED')[] = []
      if (input.issueKycRequested) issueTypes.push('KYC_REQUESTED')
      if (input.issueFundsBlocked) issueTypes.push('FUNDS_BLOCKED')

      const isIssueReport = issueTypes.length > 0 || input.issueScam === true

      let formattedAdminNote: string | null = null
      if (isIssueReport) {
        const tagLabels: string[] = [...issueTypes]
        if (input.issueScam) tagLabels.push('POTENTIAL_SCAM')
        const details = input.issueDetails?.trim() ?? ''
        formattedAdminNote = `[${tagLabels.join(', ')}]${details ? `: ${details}` : ''}`
      } else if (input.internalNote?.trim()) {
        formattedAdminNote = input.internalNote.trim()
      }

      try {
        await prisma.$transaction(async (tx) => {
          // Check for existing privateProof for this service if provided
          if (input.orderId?.trim()) {
            const existingProof = await tx.comment.findFirst({
              where: {
                serviceId: input.serviceId,
                privateProof: input.orderId.trim(),
              },
              select: { id: true },
            })

            if (existingProof) {
              throw new ActionError({
                code: 'BAD_REQUEST',
                message: 'This proof has already been reported for this service.',
              })
            }
          }

          const isRelatedToService = !!(await tx.serviceUser.findUnique({
            where: {
              userId_serviceId: {
                userId: context.locals.user.id,
                serviceId: input.serviceId,
              },
            },
            select: {
              id: true,
            },
          }))

          const commentStatus: CommentStatus =
            userCan(context.locals.user, 'comments:moderate') || isRelatedToService
              ? 'APPROVED'
              : 'PENDING'

          const commentData: Prisma.CommentCreateInput = {
            content: input.content,
            service: { connect: { id: input.serviceId } },
            author: { connect: { id: context.locals.user.id } },
            status: commentStatus,
            privateProof: input.orderId?.trim() ?? null,
            issues: issueTypes,
          }

          if (input.parentId) {
            commentData.parent = { connect: { id: input.parentId } }
          }

          if (input.rating) {
            commentData.rating = input.rating
            commentData.ratingActive = false
          }

          if (formattedAdminNote) {
            commentData.adminNote = formattedAdminNote
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

          if (input.rating && isActiveRatingStatus(commentStatus)) {
            await refreshActiveRatingForUserService(tx, context.locals.user.id, input.serviceId)
          }
        })

        return { success: true }
      } catch (error) {
        if (error instanceof ActionError) throw error

        console.error('Error creating comment:', error)
        throw new ActionError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error creating comment',
        })
      }
    },
  }),

  moderate: defineProtectedAction({
    permissions: cap('comments:moderate'),
    input: z.discriminatedUnion('action', [
      z.object({
        commentId: z.number().int().positive(),
        action: z.literal('status'),
        value: z.enum(['PENDING', 'APPROVED', 'VERIFIED', 'REJECTED']),
      }),
      z.object({
        commentId: z.number().int().positive(),
        action: z.literal('human-action'),
        value: z.enum(['APPROVE', 'REJECT', 'HOLD']),
      }),
      z.object({
        commentId: z.number().int().positive(),
        action: z.literal('rating-mute'),
        value: z.boolean(),
      }),
      z.object({
        commentId: z.number().int().positive(),
        action: z.literal('rating-mute-reason'),
        value: z.enum([
          'AUTHOR_AFFILIATED',
          'AUTHOR_LOW_TRUST',
          'SUSPICIOUS_PATTERN',
          'TEMPLATE_SPAM',
          'CONFLICT_OF_INTEREST',
          'MODERATOR_DISCRETION',
        ]),
      }),
      z.object({
        commentId: z.number().int().positive(),
        action: z.literal('private-proof-status'),
        value: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN']),
      }),
      z.object({
        commentId: z.number().int().positive(),
        action: z.enum(['public-note', 'admin-note', 'author-note']),
        value: z.string().max(4000),
      }),
      z.object({
        commentId: z.number().int().positive(),
        action: z.enum(['add-issue', 'remove-issue']),
        value: z.enum(['KYC_REQUESTED', 'FUNDS_BLOCKED']),
      }),
    ]),
    handler: async (input, context) => {
      try {
        const comment = await prisma.comment.findUnique({
          where: { id: input.commentId },
          select: {
            id: true,
            rating: true,
            serviceId: true,
            authorId: true,
            privateProof: true,
            privateProofStatus: true,
          },
        })

        if (!comment) {
          throw new ActionError({
            code: 'NOT_FOUND',
            message: 'Comment not found',
          })
        }

        // Proof gate: a comment carrying a private proof cannot be approved
        // (or verified) while that proof is still pending. The moderator must
        // first resolve the proof (approve / reject / withdraw it). Resolving
        // the proof to APPROVED is itself the approval path, handled below.
        const isApproveIntent =
          (input.action === 'human-action' && input.value === 'APPROVE') ||
          (input.action === 'status' && (input.value === 'APPROVED' || input.value === 'VERIFIED'))
        if (isApproveIntent && comment.privateProof !== null && comment.privateProofStatus === 'PENDING') {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: 'Resolve the private proof (approve, reject, or withdraw it) before approving this comment.',
          })
        }

        const updateData: Prisma.CommentUpdateInput = {}

        switch (input.action) {
          case 'status': {
            updateData.status = input.value
            // A status set from the dropdown is a human decision; record it so
            // the audit trail captures who acted and moderationState classifies
            // the row as human-resolved rather than AI-auto-decided. VERIFIED is
            // an approve-with-badge; PENDING means "send back to the queue".
            updateData.humanAction =
              input.value === 'REJECTED' ? 'REJECT' : input.value === 'PENDING' ? 'HOLD' : 'APPROVE'
            updateData.humanDecidedAt = new Date()
            updateData.humanDecidedBy = { connect: { id: context.locals.user.id } }
            break
          }
          case 'human-action': {
            updateData.humanAction = input.value
            updateData.humanDecidedAt = new Date()
            updateData.humanDecidedBy = { connect: { id: context.locals.user.id } }
            updateData.status =
              input.value === 'APPROVE' ? 'APPROVED' : input.value === 'REJECT' ? 'REJECTED' : 'PENDING'
            break
          }
          case 'rating-mute':
            updateData.ratingMuted = input.value
            updateData.ratingMuteReason = input.value ? 'MODERATOR_DISCRETION' : null
            break
          case 'rating-mute-reason':
            updateData.ratingMuteReason = input.value
            updateData.ratingMuted = true
            break
          case 'public-note':
            updateData.publicNote = input.value
            break
          case 'admin-note':
            updateData.adminNote = input.value
            break
          case 'author-note':
            updateData.authorNote = input.value
            break
          case 'private-proof-status':
            updateData.privateProofStatus = input.value
            if (input.value === 'APPROVED') {
              // Proof approval is the mod approving the comment. Record the
              // human action so audit trail captures who approved and the
              // Mod Work queue stops surfacing the row.
              updateData.status = 'APPROVED'
              updateData.humanAction = 'APPROVE'
              updateData.humanDecidedAt = new Date()
              updateData.humanDecidedBy = { connect: { id: context.locals.user.id } }
            }
            break
          case 'add-issue':
            updateData.issues = { push: input.value }
            break
          case 'remove-issue': {
            const current = await prisma.comment.findUnique({
              where: { id: input.commentId },
              select: { issues: true },
            })
            updateData.issues = {
              set: (current?.issues ?? []).filter((i) => i !== input.value),
            }
            break
          }
        }

        const shouldRefreshActiveRating =
          comment.rating !== null &&
          (input.action === 'status' ||
            input.action === 'human-action' ||
            input.action === 'rating-mute' ||
            input.action === 'rating-mute-reason' ||
            input.action === 'private-proof-status')
        const preferredCommentId =
          input.action === 'rating-mute' && !input.value ? input.commentId : undefined

        await prisma.$transaction(async (tx) => {
          await tx.comment.update({
            where: { id: input.commentId },
            data: updateData,
          })

          if (shouldRefreshActiveRating) {
            await refreshActiveRatingForUserService(tx, comment.authorId, comment.serviceId, {
              preferredCommentId,
            })
          }
        })
      } catch (error) {
        if (error instanceof ActionError) throw error

        console.error('Error moderating comment:', error)
        throw new ActionError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error moderating comment',
        })
      }
    },
  }),
}
