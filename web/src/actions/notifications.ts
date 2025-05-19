import { z } from 'astro:content'

import { defineProtectedAction } from '../lib/defineProtectedAction'
import { prisma } from '../lib/prisma'

export const notificationActions = {
  updateReadStatus: defineProtectedAction({
    accept: 'form',
    permissions: 'user',
    input: z.object({
      notificationId: z.literal('all').or(z.coerce.number().int().positive()),
      read: z.coerce.boolean(),
    }),
    handler: async (input, context) => {
      await prisma.notification.updateMany({
        where:
          input.notificationId === 'all'
            ? { userId: context.locals.user.id, read: !input.read }
            : { userId: context.locals.user.id, id: input.notificationId },
        data: {
          read: input.read,
        },
      })
    },
  }),
  preferences: {
    update: defineProtectedAction({
      accept: 'form',
      permissions: 'user',
      input: z.object({
        enableOnMyCommentStatusChange: z.coerce.boolean().optional(),
        enableAutowatchMyComments: z.coerce.boolean().optional(),
        enableNotifyPendingRepliesOnWatch: z.coerce.boolean().optional(),
      }),
      handler: async (input, context) => {
        await prisma.notificationPreferences.upsert({
          where: { userId: context.locals.user.id },
          update: {
            enableOnMyCommentStatusChange: input.enableOnMyCommentStatusChange,
            enableAutowatchMyComments: input.enableAutowatchMyComments,
            enableNotifyPendingRepliesOnWatch: input.enableNotifyPendingRepliesOnWatch,
          },
          create: {
            userId: context.locals.user.id,
            enableOnMyCommentStatusChange: input.enableOnMyCommentStatusChange,
            enableAutowatchMyComments: input.enableAutowatchMyComments,
            enableNotifyPendingRepliesOnWatch: input.enableNotifyPendingRepliesOnWatch,
          },
        })
      },
    }),

    watchComment: defineProtectedAction({
      accept: 'form',
      permissions: 'user',
      input: z.object({
        commentId: z.coerce.number().int().positive(),
        watch: z.coerce.boolean(),
      }),
      handler: async (input, context) => {
        await prisma.notificationPreferences.upsert({
          where: { userId: context.locals.user.id },
          update: {
            watchedComments: input.watch
              ? { connect: { id: input.commentId } }
              : { disconnect: { id: input.commentId } },
          },
          create: {
            userId: context.locals.user.id,
            watchedComments: input.watch ? { connect: { id: input.commentId } } : undefined,
          },
        })
      },
    }),

    watchService: defineProtectedAction({
      accept: 'form',
      permissions: 'user',
      input: z.object({
        serviceId: z.coerce.number().int().positive(),
        watchType: z.enum(['all', 'comments', 'events', 'verification']),
        value: z.coerce.boolean(),
      }),
      handler: async (input, context) => {
        await prisma.notificationPreferences.upsert({
          where: { userId: context.locals.user.id },
          update: {
            onEventCreatedForServices:
              input.watchType === 'events' || input.watchType === 'all'
                ? input.value
                  ? { connect: { id: input.serviceId } }
                  : { disconnect: { id: input.serviceId } }
                : undefined,
            onRootCommentCreatedForServices:
              input.watchType === 'comments' || input.watchType === 'all'
                ? input.value
                  ? { connect: { id: input.serviceId } }
                  : { disconnect: { id: input.serviceId } }
                : undefined,
            onVerificationChangeForServices:
              input.watchType === 'verification' || input.watchType === 'all'
                ? input.value
                  ? { connect: { id: input.serviceId } }
                  : { disconnect: { id: input.serviceId } }
                : undefined,
          },
          create: {
            userId: context.locals.user.id,
            onEventCreatedForServices:
              input.watchType === 'events' || input.watchType === 'all'
                ? input.value
                  ? { connect: { id: input.serviceId } }
                  : undefined
                : undefined,
            onRootCommentCreatedForServices:
              input.watchType === 'comments' || input.watchType === 'all'
                ? input.value
                  ? { connect: { id: input.serviceId } }
                  : undefined
                : undefined,
            onVerificationChangeForServices:
              input.watchType === 'verification' || input.watchType === 'all'
                ? input.value
                  ? { connect: { id: input.serviceId } }
                  : undefined
                : undefined,
          },
        })
      },
    }),
  },
}
