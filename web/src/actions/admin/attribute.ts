import { AttributeCategory, AttributeType } from '@prisma/client'
import { z } from 'astro/zod'
import { ActionError } from 'astro:actions'
import slugify from 'slugify'

import { defineProtectedAction } from '../../lib/defineProtectedAction'
import { prisma } from '../../lib/prisma'

import type { Prisma } from '@prisma/client'

const attributeInputSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  category: z.nativeEnum(AttributeCategory),
  type: z.nativeEnum(AttributeType),
  privacyPoints: z.coerce.number().int().min(-100).max(100).default(0),
  trustPoints: z.coerce.number().int().min(-100).max(100).default(0),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .regex(/^[a-z0-9-]+$/, 'Allowed characters: lowercase letters, numbers, and hyphens'),
})

const attributeSelect = {
  id: true,
  slug: true,
  title: true,
  description: true,
  category: true,
  type: true,
  privacyPoints: true,
  trustPoints: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AttributeSelect

export const adminAttributeActions = {
  create: defineProtectedAction({
    accept: 'form',
    permissions: 'admin',
    input: z.object({
      title: z.string().min(1, 'Title is required'),
      description: z.string().min(1, 'Description is required'),
      category: z.nativeEnum(AttributeCategory),
      type: z.nativeEnum(AttributeType),
      privacyPoints: z.coerce.number().int().min(-100).max(100).default(0),
      trustPoints: z.coerce.number().int().min(-100).max(100).default(0),
    }),
    handler: async (input) => {
      const slug = slugify(input.title, { lower: true, strict: true })

      const attribute = await prisma.attribute.create({
        data: {
          ...input,
          slug,
        },
        select: attributeSelect,
      })
      return { attribute }
    },
  }),

  update: defineProtectedAction({
    accept: 'form',
    permissions: 'admin',
    input: attributeInputSchema.extend({
      id: z.coerce.number().int().positive(),
    }),
    handler: async (input) => {
      const { id, title, slug, ...data } = input

      const existingAttribute = await prisma.attribute.findUnique({
        where: { id },
        select: { title: true, slug: true },
      })

      if (!existingAttribute) {
        throw new ActionError({
          code: 'NOT_FOUND',
          message: 'Attribute not found',
        })
      }

      // Check for slug uniqueness (ignore current attribute)
      const slugConflict = await prisma.attribute.findFirst({
        where: { slug, NOT: { id } },
        select: { id: true },
      })
      if (slugConflict) {
        throw new ActionError({
          code: 'CONFLICT',
          message: 'Slug already in use',
        })
      }

      const attribute = await prisma.attribute.update({
        where: { id },
        data: {
          title,
          slug,
          ...data,
        },
        select: attributeSelect,
      })

      return { attribute }
    },
  }),

  delete: defineProtectedAction({
    accept: 'form',
    permissions: 'admin',
    input: z.object({
      id: z.coerce.number().int().positive('Attribute ID must be a positive integer.'),
    }),
    handler: async ({ id }) => {
      try {
        await prisma.attribute.delete({
          where: { id },
        })
        return { success: true, message: 'Attribute deleted successfully.' }
      } catch (error) {
        // Prisma throws an error if the record to delete is not found,
        // or if there are related records that prevent deletion (foreign key constraints).
        // We can customize the error message based on the type of error if needed.
        console.error('Error deleting attribute:', error)
        throw new ActionError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete attribute. It might be in use or already deleted.',
        })
      }
    },
  }),
}
