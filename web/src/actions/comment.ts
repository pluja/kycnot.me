import crypto from 'crypto'

import { ActionError } from 'astro:actions'
import { z } from 'astro/zod'
import { formatDistanceStrict } from 'date-fns'

import { karmaUnlocksById } from '../constants/karmaUnlocks'
import { defineProtectedAction } from '../lib/defineProtectedAction'
import { makeKarmaUnlockMessage } from '../lib/karmaUnlocks'
import { getOrCreateNotificationPreferences } from '../lib/notificationPreferences'
import { prisma } from '../lib/prisma'
import { handleHoneypotTrap, handleXSSDetection } from '../lib/spamDetection'
import { timeTrapSecretKey } from '../lib/timeTrapSecret'

import type { CommentStatus, Prisma } from '@prisma/client'

const COMMENT_RATE_LIMIT_WINDOW_MINUTES = 2
const MAX_COMMENTS_PER_WINDOW = 1
const MAX_COMMENTS_PER_WINDOW_VERIFIED_USER = 10
export const COMMENT_ORDER_ID_MAX_LENGTH = 100

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

      // --- Format Internal Note from Issue Reports ---
      let formattedInternalNote: string | null = null
      // Track if this is an issue report
      const isIssueReport =
        input.issueKycRequested === true || input.issueFundsBlocked === true || input.issueScam === true

      if (isIssueReport) {
        const issueTypes = []
        if (input.issueKycRequested) issueTypes.push('KYC REQUESTED')
        if (input.issueFundsBlocked) issueTypes.push('FUNDS BLOCKED')
        if (input.issueScam) issueTypes.push('POTENTIAL SCAM')

        const details = input.issueDetails?.trim() ?? ''

        formattedInternalNote = `[${issueTypes.join(', ')}]${details ? `: ${details}` : ''}`
      } else if (input.internalNote?.trim()) {
        formattedInternalNote = input.internalNote.trim()
      }

      // Determine if admin review is needed (always true for issue reports)
      const requiresAdminReview = isIssueReport || !!(formattedInternalNote && !context.locals.user.admin)

      try {
        await prisma.$transaction(async (tx) => {
          // First deactivate any existing ratings if providing a new rating
          if (input.rating) {
            await tx.comment.updateMany({
              where: {
                serviceId: input.serviceId,
                authorId: context.locals.user.id,
                rating: { not: null },
              },
              data: {
                ratingActive: false,
              },
            })
          }

          // Check for existing orderId for this service if provided
          if (input.orderId?.trim()) {
            const existingOrderId = await tx.comment.findFirst({
              where: {
                serviceId: input.serviceId,
                orderId: input.orderId.trim(),
              },
              select: { id: true },
            })

            if (existingOrderId) {
              throw new ActionError({
                code: 'BAD_REQUEST',
                message: 'This Order ID has already been reported for this service.',
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

          // Prepare data object with proper type safety
          const commentData: Prisma.CommentCreateInput = {
            content: input.content,
            service: { connect: { id: input.serviceId } },
            author: { connect: { id: context.locals.user.id } },

            // Change status to HUMAN_PENDING if there's an issue report, this is so that the AI worker does not pick it up for review
            status:
              context.locals.user.admin || context.locals.user.moderator || isRelatedToService
                ? 'APPROVED'
                : isIssueReport
                  ? 'HUMAN_PENDING'
                  : 'PENDING',
            requiresAdminReview,
            orderId: input.orderId?.trim() ?? null,
            kycRequested: input.issueKycRequested === true,
            fundsBlocked: input.issueFundsBlocked === true,
          }

          if (input.parentId) {
            commentData.parent = { connect: { id: input.parentId } }
          }

          if (input.rating) {
            commentData.rating = input.rating
            commentData.ratingActive = true
          }

          if (formattedInternalNote) {
            commentData.internalNote = formattedInternalNote
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
    permissions: ['admin', 'moderator'],
    input: z.object({
      commentId: z.number(),
      userId: z.number(),
      action: z.enum([
        'status',
        'suspicious',
        'requires-admin-review',
        'community-note',
        'internal-note',
        'private-context',
        'order-id-status',
        'kyc-requested',
        'funds-blocked',
        'toggle-rating-active',
      ]),
      value: z.union([
        z.enum(['PENDING', 'APPROVED', 'VERIFIED', 'REJECTED']),
        z.enum(['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN']),
        z.boolean(),
        z.string(),
      ]),
    }),
    handler: async (input) => {
      try {
        const comment = await prisma.comment.findUnique({
          where: { id: input.commentId },
          select: {
            id: true,
            rating: true,
            serviceId: true,
            createdAt: true,
            authorId: true,
          },
        })

        if (!comment) {
          throw new ActionError({
            code: 'NOT_FOUND',
            message: 'Comment not found',
          })
        }

        const updateData: Prisma.CommentUpdateInput = {}

        switch (input.action) {
          case 'status':
            updateData.status = input.value as CommentStatus
            break
          case 'suspicious': {
            const isSpam = !!input.value
            updateData.suspicious = isSpam
            updateData.ratingActive = false

            if (!isSpam && comment.rating) {
              const newestRatingOrActiveRating = await prisma.comment.findFirst({
                where: {
                  serviceId: comment.serviceId,
                  authorId: comment.authorId,
                  id: { not: input.commentId },
                  rating: { not: null },
                  OR: [{ createdAt: { gt: comment.createdAt } }, { ratingActive: true }],
                },
              })
              updateData.ratingActive = !newestRatingOrActiveRating
            }
            break
          }
          case 'requires-admin-review':
            updateData.requiresAdminReview = !!input.value
            break
          case 'community-note':
            updateData.communityNote = input.value as string
            break
          case 'internal-note':
            updateData.internalNote = input.value as string
            break
          case 'private-context':
            updateData.privateContext = input.value as string
            break
          case 'order-id-status':
            updateData.orderIdStatus = input.value as 'APPROVED' | 'PENDING' | 'REJECTED' | 'WITHDRAWN'
            break
          case 'kyc-requested':
            updateData.kycRequested = !!input.value
            break
          case 'funds-blocked':
            updateData.fundsBlocked = !!input.value
            break
          case 'toggle-rating-active':
            updateData.ratingActive = !!input.value
            break
        }

        // Update the comment
        await prisma.comment.update({
          where: { id: input.commentId },
          data: updateData,
        })

        return { success: true }
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
