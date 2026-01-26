import { ServiceSuggestionStatus } from '@prisma/client'
import { z } from 'astro/zod'
import { ActionError } from 'astro:actions'

import { defineProtectedAction } from '../../lib/defineProtectedAction'
import { prisma } from '../../lib/prisma'
import { sendChatMessageEvents } from '../../lib/sendChatEvents'

export const adminServiceSuggestionActions = {
  update: defineProtectedAction({
    accept: 'form',
    permissions: 'admin',
    input: z.object({
      suggestionId: z.coerce.number().int().positive(),
      status: z.nativeEnum(ServiceSuggestionStatus),
    }),
    handler: async (input) => {
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

      await prisma.serviceSuggestion.update({
        where: { id: suggestion.id },
        data: {
          status: input.status,
        },
      })
    },
  }),

  message: defineProtectedAction({
    accept: 'form',
    permissions: 'admin',
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
