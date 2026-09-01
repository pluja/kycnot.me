import { ServiceSuggestionStatus } from '@prisma/client'
import { z } from 'astro/zod'
import { ActionError } from 'astro:actions'

import { recordAuditLog } from '../../lib/auditLog'
import { defineProtectedAction } from '../../lib/defineProtectedAction'
import { cap } from '../../lib/permissions'
import { prisma } from '../../lib/prisma'
import { sendChatMessageEvents } from '../../lib/sendChatEvents'
import { transformCase } from '../../lib/strings'

export const adminServiceSuggestionActions = {
  update: defineProtectedAction({
    accept: 'form',
    permissions: cap('suggestions:manage'),
    input: z.object({
      suggestionId: z.coerce.number().int().positive(),
      status: z.nativeEnum(ServiceSuggestionStatus),
    }),
    handler: async (input, { locals }) => {
      const suggestion = await prisma.serviceSuggestion.findUnique({
        select: {
          id: true,
          status: true,
          serviceId: true,
        },
        where: { id: input.suggestionId },
      })

      if (!suggestion) {
        throw new ActionError({
          code: 'NOT_FOUND',
          message: 'Suggestion not found',
        })
      }

      await prisma.$transaction(async (tx) => {
        await tx.serviceSuggestion.update({
          where: { id: suggestion.id },
          data: { status: input.status },
        })
        await recordAuditLog(tx, {
          actorId: locals.user.id,
          action: 'STATUS_CHANGED',
          targetType: 'SERVICE_SUGGESTION',
          targetId: suggestion.id,
          summary: `Status set to ${transformCase(input.status.replace('_', ' '), 'lower')}, from ${transformCase(suggestion.status.replace('_', ' '), 'lower')}`,
        })
      })
    },
  }),

  message: defineProtectedAction({
    accept: 'form',
    permissions: cap('suggestions:manage'),
    input: z.object({
      suggestionId: z.coerce.number().int().positive(),
      content: z.string().min(1).max(1000),
    }),
    handler: async (input, context) => {
      const suggestion = await prisma.serviceSuggestion.findUnique({
        select: {
          id: true,
          userId: true,
        },
        where: { id: input.suggestionId },
      })

      if (!suggestion) {
        throw new Error('Suggestion not found')
      }

      await prisma.serviceSuggestionMessage.create({
        data: {
          content: input.content,
          suggestionId: suggestion.id,
          userId: context.locals.user.id,
        },
      })

      sendChatMessageEvents(suggestion.id, context.locals.user.id).catch(console.error)
    },
  }),
}
