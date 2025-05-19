import { EventType } from '@prisma/client'
import { z } from 'astro/zod'
import { ActionError } from 'astro:actions'

import { defineProtectedAction } from '../../lib/defineProtectedAction'
import { prisma } from '../../lib/prisma'

export const adminEventActions = {
  create: defineProtectedAction({
    accept: 'form',
    permissions: 'admin',
    input: z
      .object({
        serviceId: z.coerce.number().int().positive(),
        title: z.string().min(1),
        content: z.string().min(1),
        icon: z.string().optional(),
        source: z.string().optional(),
        type: z.nativeEnum(EventType).default('NORMAL'),
        startedAt: z.coerce.date(),
        endedAt: z.coerce.date().optional(),
      })
      .superRefine((data, ctx) => {
        if (data.endedAt && data.startedAt > data.endedAt) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['endedAt'],
            message: 'Ended at must be after started at',
          })
        }
      }),
    handler: async (input) => {
      const event = await prisma.event.create({
        data: {
          ...input,
          visible: true,
        },
        select: {
          id: true,
        },
      })
      return { event }
    },
  }),

  toggle: defineProtectedAction({
    accept: 'form',
    permissions: 'admin',
    input: z.object({
      eventId: z.coerce.number().int().positive(),
    }),
    handler: async (input) => {
      const existingEvent = await prisma.event.findUnique({ where: { id: input.eventId } })
      if (!existingEvent) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'Event not found',
        })
      }

      const event = await prisma.event.update({
        where: { id: input.eventId },
        data: {
          visible: !existingEvent.visible,
        },
        select: {
          id: true,
        },
      })
      return { event }
    },
  }),

  update: defineProtectedAction({
    accept: 'form',
    permissions: 'admin',
    input: z
      .object({
        eventId: z.coerce.number().int().positive(),
        title: z.string().min(1),
        content: z.string().min(1),
        icon: z.string().optional(),
        source: z.string().optional(),
        type: z.nativeEnum(EventType).default('NORMAL'),
        startedAt: z.coerce.date(),
        endedAt: z.coerce.date().optional(),
      })
      .superRefine((data, ctx) => {
        if (data.endedAt && data.startedAt > data.endedAt) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['endedAt'],
            message: 'Ended at must be after started at',
          })
        }
      }),
    handler: async (input) => {
      const { eventId, ...data } = input
      const existingEvent = await prisma.event.findUnique({ where: { id: eventId } })
      if (!existingEvent) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'Event not found',
        })
      }

      const event = await prisma.event.update({
        where: { id: eventId },
        data,
        select: {
          id: true,
        },
      })
      return { event }
    },
  }),

  delete: defineProtectedAction({
    accept: 'form',
    permissions: 'admin',
    input: z.object({
      eventId: z.coerce.number().int().positive(),
    }),
    handler: async (input) => {
      const event = await prisma.event.delete({ where: { id: input.eventId } })
      return { event }
    },
  }),
}
