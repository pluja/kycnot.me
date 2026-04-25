import { type Prisma } from '@prisma/client'
import { z } from 'astro/zod'
import { ActionError } from 'astro:actions'

import { defineProtectedAction } from '../../lib/defineProtectedAction'
import { prisma } from '../../lib/prisma'

const selectAnnouncementReturnFields = {
  id: true,
  content: true,
  type: true,
  link: true,
  linkText: true,
  startDate: true,
  endDate: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.AnnouncementSelect

export const adminAnnouncementActions = {
  create: defineProtectedAction({
    accept: 'form',
    permissions: 'admin',
    input: z.object({
      content: z
        .string()
        .min(1, 'Content is required')
        .max(1000, 'Content must be less than 1000 characters'),
      type: z.enum(['INFO', 'WARNING', 'ALERT']),
      link: z.string().url().nullable().optional(),
      linkText: z
        .string()
        .min(1, 'Link text is required')
        .max(255, 'Link text must be less than 255 characters')
        .nullable()
        .optional(),
      startDate: z.coerce.date(),
      endDate: z.coerce.date().nullable().optional(),
      isActive: z.coerce.boolean().default(true),
    }),
    handler: async (input) => {
      const announcement = await prisma.announcement.create({
        data: {
          content: input.content,
          type: input.type,
          startDate: input.startDate,
          isActive: input.isActive,
          link: input.link ?? null,
          linkText: input.linkText ?? null,
          endDate: input.endDate ?? null,
        },
        select: selectAnnouncementReturnFields,
      })

      return { announcement }
    },
  }),

  update: defineProtectedAction({
    accept: 'form',
    permissions: 'admin',
    input: z.object({
      id: z.coerce.number().int().positive(),
      content: z
        .string()
        .min(1, 'Content is required')
        .max(1000, 'Content must be less than 1000 characters'),
      type: z.enum(['INFO', 'WARNING', 'ALERT']),
      link: z.string().url().nullable().optional(),
      linkText: z
        .string()
        .min(1, 'Link text is required')
        .max(255, 'Link text must be less than 255 characters')
        .nullable()
        .optional(),
      startDate: z.coerce.date(),
      endDate: z.coerce.date().nullable().optional(),
      isActive: z.coerce.boolean().default(true),
    }),
    handler: async (input) => {
      const announcement = await prisma.announcement.findUnique({
        where: {
          id: input.id,
        },
        select: {
          id: true,
        },
      })

      if (!announcement) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'Announcement not found',
        })
      }

      const updatedAnnouncement = await prisma.announcement.update({
        where: { id: announcement.id },
        data: {
          content: input.content,
          type: input.type,
          startDate: input.startDate,
          isActive: input.isActive,
          link: input.link ?? null,
          linkText: input.linkText ?? null,
          endDate: input.endDate ?? null,
        },
        select: selectAnnouncementReturnFields,
      })

      return { updatedAnnouncement }
    },
  }),

  delete: defineProtectedAction({
    accept: 'form',
    permissions: 'admin',
    input: z.object({
      id: z.coerce.number().int().positive(),
    }),
    handler: async (input) => {
      const announcement = await prisma.announcement.findUnique({
        where: {
          id: input.id,
        },
        select: {
          id: true,
        },
      })

      if (!announcement) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'Announcement not found',
        })
      }

      await prisma.announcement.delete({
        where: { id: announcement.id },
      })

      return { success: true }
    },
  }),

  toggleActive: defineProtectedAction({
    accept: 'form',
    permissions: 'admin',
    input: z.object({
      id: z.coerce.number().int().positive(),
      isActive: z.coerce.boolean(),
    }),
    handler: async (input) => {
      const announcement = await prisma.announcement.findUnique({
        where: {
          id: input.id,
        },
        select: {
          id: true,
        },
      })

      if (!announcement) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'Announcement not found',
        })
      }

      const updatedAnnouncement = await prisma.announcement.update({
        where: { id: announcement.id },
        data: {
          isActive: input.isActive,
        },
        select: selectAnnouncementReturnFields,
      })

      return { updatedAnnouncement }
    },
  }),
}
