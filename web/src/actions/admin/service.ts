import { Currency, ServiceVisibility, VerificationStatus } from '@prisma/client'
import { z } from 'astro/zod'
import { ActionError } from 'astro:actions'
import slugify from 'slugify'

import { defineProtectedAction } from '../../lib/defineProtectedAction'
import { saveFileLocally } from '../../lib/fileStorage'
import { prisma } from '../../lib/prisma'
import {
  imageFileSchema,
  stringListOfUrlsSchema,
  stringListOfUrlsSchemaRequired,
  zodCohercedNumber,
} from '../../lib/zodUtils'

const serviceSchemaBase = z.object({
  id: z.number().int().positive(),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/, 'Allowed characters: lowercase letters, numbers, and hyphens')
    .optional(),
  name: z.string().min(1).max(20),
  description: z.string().min(1),
  serviceUrls: stringListOfUrlsSchemaRequired,
  tosUrls: stringListOfUrlsSchemaRequired,
  onionUrls: stringListOfUrlsSchema,
  kycLevel: z.coerce.number().int().min(0).max(4),
  attributes: z.array(z.coerce.number().int().positive()),
  categories: z.array(z.coerce.number().int().positive()).min(1),
  verificationStatus: z.nativeEnum(VerificationStatus),
  verificationSummary: z.string().optional().nullable().default(null),
  verificationProofMd: z.string().optional().nullable().default(null),
  acceptedCurrencies: z.array(z.nativeEnum(Currency)),
  referral: z.string().optional().nullable().default(null),
  imageFile: imageFileSchema,
  overallScore: zodCohercedNumber(z.number().int().min(0).max(10)).optional(),
  serviceVisibility: z.nativeEnum(ServiceVisibility),
})

const addSlugIfMissing = <
  T extends {
    slug?: string | null | undefined
    name: string
  },
>(
  input: T
) => ({
  ...input,
  slug:
    input.slug ??
    slugify(input.name, {
      lower: true,
      strict: true,
      remove: /[^a-zA-Z0-9\-._]/g,
      replacement: '-',
    }),
})

export const adminServiceActions = {
  create: defineProtectedAction({
    accept: 'form',
    permissions: 'admin',
    input: serviceSchemaBase.omit({ id: true }).transform(addSlugIfMissing),
    handler: async (input) => {
      const existing = await prisma.service.findUnique({
        where: {
          slug: input.slug,
        },
      })

      if (existing) {
        throw new ActionError({
          code: 'CONFLICT',
          message: 'A service with this slug already exists',
        })
      }

      const { imageFile, ...serviceData } = input
      const imageUrl = imageFile ? await saveFileLocally(imageFile, imageFile.name) : undefined

      const service = await prisma.service.create({
        data: {
          ...serviceData,
          categories: {
            connect: input.categories.map((id) => ({ id })),
          },
          attributes: {
            create: input.attributes.map((attributeId) => ({
              attribute: {
                connect: { id: attributeId },
              },
            })),
          },
          imageUrl,
        },
        select: {
          id: true,
          slug: true,
        },
      })

      return { service }
    },
  }),

  update: defineProtectedAction({
    accept: 'form',
    permissions: 'admin',
    input: serviceSchemaBase.transform(addSlugIfMissing),
    handler: async (input) => {
      const { id, categories, attributes, imageFile, ...data } = input

      const existing = await prisma.service.findUnique({
        where: {
          slug: input.slug,
          NOT: { id },
        },
      })

      if (existing) {
        throw new ActionError({
          code: 'CONFLICT',
          message: 'A service with this slug already exists',
        })
      }

      const imageUrl = imageFile ? await saveFileLocally(imageFile, imageFile.name) : undefined

      // Get existing attributes and categories to compute differences
      const existingService = await prisma.service.findUnique({
        where: { id },
        include: {
          categories: true,
          attributes: {
            include: {
              attribute: true,
            },
          },
        },
      })

      if (!existingService) {
        throw new ActionError({
          code: 'NOT_FOUND',
          message: 'Service not found',
        })
      }

      // Find categories to connect and disconnect
      const existingCategoryIds = existingService.categories.map((c) => c.id)
      const categoriesToAdd = categories.filter((cId) => !existingCategoryIds.includes(cId))
      const categoriesToRemove = existingCategoryIds.filter((cId) => !categories.includes(cId))

      // Find attributes to connect and disconnect
      const existingAttributeIds = existingService.attributes.map((a) => a.attributeId)
      const attributesToAdd = attributes.filter((aId) => !existingAttributeIds.includes(aId))
      const attributesToRemove = existingAttributeIds.filter((aId) => !attributes.includes(aId))

      const service = await prisma.service.update({
        where: { id },
        data: {
          ...data,
          imageUrl,
          categories: {
            connect: categoriesToAdd.map((id) => ({ id })),
            disconnect: categoriesToRemove.map((id) => ({ id })),
          },
          attributes: {
            // Connect new attributes
            create: attributesToAdd.map((attributeId) => ({
              attribute: {
                connect: { id: attributeId },
              },
            })),
            // Delete specific attributes that are no longer needed
            deleteMany: attributesToRemove.map((attributeId) => ({
              attributeId,
            })),
          },
        },
      })
      return { service }
    },
  }),

  createContactMethod: defineProtectedAction({
    accept: 'form',
    permissions: 'admin',
    input: z.object({
      label: z.string().min(1).max(50).optional(),
      value: z.string().url(),
      serviceId: z.number().int().positive(),
    }),
    handler: async (input) => {
      const contactMethod = await prisma.serviceContactMethod.create({
        data: input,
      })
      return { contactMethod }
    },
  }),

  updateContactMethod: defineProtectedAction({
    accept: 'form',
    permissions: 'admin',
    input: z.object({
      id: z.number().int().positive().optional(),
      label: z.string().min(1).max(50).optional(),
      value: z.string().url(),
      serviceId: z.number().int().positive(),
    }),
    handler: async (input) => {
      const { id, ...data } = input
      const contactMethod = await prisma.serviceContactMethod.update({
        where: { id },
        data,
      })
      return { contactMethod }
    },
  }),

  deleteContactMethod: defineProtectedAction({
    accept: 'form',
    permissions: 'admin',
    input: z.object({
      id: z.number().int().positive(),
    }),
    handler: async (input) => {
      await prisma.serviceContactMethod.delete({
        where: { id: input.id },
      })
      return { success: true }
    },
  }),
}
