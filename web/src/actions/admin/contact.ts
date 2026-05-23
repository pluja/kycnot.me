import { z } from 'astro/zod'
import { ActionError } from 'astro:actions'

import { defineProtectedAction } from '../../lib/defineProtectedAction'
import { prisma } from '../../lib/prisma'

export const adminContactActions = {
  update: defineProtectedAction({
    permissions: ['admin', 'moderator'],
    input: z.discriminatedUnion('action', [
      z.object({
        messageId: z.number().int().positive(),
        action: z.literal('mark-read'),
        value: z.boolean(),
      }),
      z.object({
        messageId: z.number().int().positive(),
        action: z.literal('mark-replied'),
        value: z.boolean(),
      }),
      z.object({
        messageId: z.number().int().positive(),
        action: z.literal('admin-note'),
        value: z.string().max(2000),
      }),
      z.object({
        messageId: z.number().int().positive(),
        action: z.literal('delete'),
      }),
    ]),
    handler: async (input) => {
      const message = await prisma.contactMessage.findUnique({
        where: { id: input.messageId },
        select: { id: true },
      })
      if (!message) {
        throw new ActionError({ code: 'NOT_FOUND', message: 'Message not found' })
      }

      switch (input.action) {
        case 'mark-read':
          await prisma.contactMessage.update({
            where: { id: input.messageId },
            data: { readAt: input.value ? new Date() : null },
          })
          return
        case 'mark-replied':
          await prisma.contactMessage.update({
            where: { id: input.messageId },
            // Marking replied implies read.
            data: {
              repliedAt: input.value ? new Date() : null,
              ...(input.value ? { readAt: new Date() } : {}),
            },
          })
          return
        case 'admin-note':
          await prisma.contactMessage.update({
            where: { id: input.messageId },
            data: { adminNote: input.value.length > 0 ? input.value : null },
          })
          return
        case 'delete':
          await prisma.contactMessage.delete({ where: { id: input.messageId } })
          return
      }
    },
  }),
}
