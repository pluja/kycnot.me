import { z } from 'astro/zod'
import { ActionError } from 'astro:actions'

import { defineProtectedAction } from '../../../lib/defineProtectedAction'
import { prisma } from '../../../lib/prisma'

const tosHighlightFieldsSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(120),
  content: z.string().trim().min(1, 'Content is required').max(2000),
  rating: z.enum(['negative', 'neutral', 'positive']),
})

export const tosHighlightActions = {
  add: defineProtectedAction({
    accept: 'form',
    permissions: 'admin',
    input: tosHighlightFieldsSchema.extend({
      serviceId: z.coerce.number().int().positive(),
    }),
    handler: async (input) => {
      const service = await prisma.service.findUnique({
        where: { id: input.serviceId },
        select: { tosReview: true },
      })

      if (!service) {
        throw new ActionError({
          code: 'NOT_FOUND',
          message: 'Service not found',
        })
      }

      if (!service.tosReview) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'No ToS review exists yet. Highlights can only be added once a review has been generated.',
        })
      }

      const newHighlight = {
        title: input.title,
        content: input.content,
        rating: input.rating,
      }
      const tosReview = {
        ...service.tosReview,
        highlights: [...service.tosReview.highlights, newHighlight],
      }

      await prisma.service.update({
        where: { id: input.serviceId },
        data: { tosReview },
      })
    },
  }),

  update: defineProtectedAction({
    accept: 'form',
    permissions: 'admin',
    input: tosHighlightFieldsSchema.extend({
      serviceId: z.coerce.number().int().positive(),
      index: z.coerce.number().int().min(0),
    }),
    handler: async (input) => {
      const service = await prisma.service.findUnique({
        where: { id: input.serviceId },
        select: { tosReview: true },
      })

      if (!service?.tosReview) {
        throw new ActionError({
          code: 'NOT_FOUND',
          message: 'ToS review not found',
        })
      }

      if (input.index >= service.tosReview.highlights.length) {
        throw new ActionError({
          code: 'NOT_FOUND',
          message: 'Highlight not found',
        })
      }

      const highlights = service.tosReview.highlights.map((highlight, index) =>
        index === input.index
          ? { title: input.title, content: input.content, rating: input.rating }
          : highlight
      )
      const tosReview = { ...service.tosReview, highlights }

      await prisma.service.update({
        where: { id: input.serviceId },
        data: { tosReview },
      })
    },
  }),

  delete: defineProtectedAction({
    accept: 'form',
    permissions: 'admin',
    input: z.object({
      serviceId: z.coerce.number().int().positive(),
      index: z.coerce.number().int().min(0),
    }),
    handler: async (input) => {
      const service = await prisma.service.findUnique({
        where: { id: input.serviceId },
        select: { tosReview: true },
      })

      if (!service?.tosReview) {
        throw new ActionError({
          code: 'NOT_FOUND',
          message: 'ToS review not found',
        })
      }

      if (input.index >= service.tosReview.highlights.length) {
        throw new ActionError({
          code: 'NOT_FOUND',
          message: 'Highlight not found',
        })
      }

      const highlights = service.tosReview.highlights.filter((_, index) => index !== input.index)
      const tosReview = { ...service.tosReview, highlights }

      await prisma.service.update({
        where: { id: input.serviceId },
        data: { tosReview },
      })
    },
  }),
}
