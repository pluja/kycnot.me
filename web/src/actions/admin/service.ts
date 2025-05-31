import { Currency, ServiceVisibility, VerificationStatus } from '@prisma/client'
import { z } from 'astro/zod'
import { ActionError } from 'astro:actions'
import { uniq } from 'lodash-es'
import slugify from 'slugify'

import { defineProtectedAction } from '../../lib/defineProtectedAction'
import { saveFileLocally } from '../../lib/fileStorage'
import { prisma } from '../../lib/prisma'
import { separateServiceUrlsByType } from '../../lib/urls'
import { imageFileSchema, stringListOfUrlsSchemaRequired, zodCohercedNumber } from '../../lib/zodUtils'

const serviceSchemaBase = z.object({
  id: z.number().int().positive(),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/, 'Allowed characters: lowercase letters, numbers, and hyphens')
    .optional(),
  name: z.string().min(1).max(40),
  description: z.string().min(1),
  allServiceUrls: stringListOfUrlsSchemaRequired,
  tosUrls: stringListOfUrlsSchemaRequired,
  kycLevel: z.coerce.number().int().min(0).max(4),
  attributes: z.array(z.coerce.number().int().positive()),
  categories: z.array(z.coerce.number().int().positive()).min(1),
  verificationStatus: z.nativeEnum(VerificationStatus),
  verificationSummary: z.string().optional().nullable().default(null),
  verificationProofMd: z.string().optional().nullable().default(null),
  acceptedCurrencies: z.array(z.nativeEnum(Currency)),
  referral: z
    .string()
    .regex(/^(\?\w+=.|\/.+)/, 'Referral must be a valid URL parameter or path, not a full URL')
    .optional()
    .nullable()
    .default(null),
  imageFile: imageFileSchema,
  overallScore: zodCohercedNumber(z.number().int().min(0).max(10)).optional(),
  serviceVisibility: z.nativeEnum(ServiceVisibility),
  internalNote: z.string().optional(),
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
    handler: async (input, context) => {
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

      const imageUrl = input.imageFile
        ? await saveFileLocally(input.imageFile, input.imageFile.name)
        : undefined

      const {
        web: serviceUrls,
        onion: onionUrls,
        i2p: i2pUrls,
      } = separateServiceUrlsByType(input.allServiceUrls)

      const service = await prisma.service.create({
        data: {
          name: input.name,
          description: input.description,
          serviceUrls,
          tosUrls: input.tosUrls,
          onionUrls,
          i2pUrls,
          kycLevel: input.kycLevel,
          verificationStatus: input.verificationStatus,
          verificationSummary: input.verificationSummary,
          verificationProofMd: input.verificationProofMd,
          acceptedCurrencies: input.acceptedCurrencies,
          referral: input.referral,
          serviceVisibility: input.serviceVisibility,
          slug: input.slug,
          overallScore: input.overallScore,
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
          internalNotes: input.internalNote
            ? {
                create: {
                  content: input.internalNote,
                  addedByUserId: context.locals.user.id,
                },
              }
            : undefined,
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
    input: serviceSchemaBase
      .extend({
        removeImage: z.boolean().optional(),
      })
      .transform(addSlugIfMissing),
    handler: async (input) => {
      const anotherServiceWithNewSlug = await prisma.service.findUnique({
        where: {
          slug: input.slug,
          NOT: { id: input.id },
        },
      })

      if (anotherServiceWithNewSlug) {
        throw new ActionError({
          code: 'CONFLICT',
          message: 'A service with this slug already exists',
        })
      }

      const imageUrl = input.removeImage
        ? null
        : input.imageFile
          ? await saveFileLocally(input.imageFile, input.imageFile.name)
          : undefined

      const existingService = await prisma.service.findUnique({
        where: { id: input.id },
        select: {
          slug: true,
          previousSlugs: true,
          categories: {
            select: {
              id: true,
            },
          },
          attributes: {
            select: {
              attributeId: true,
              attribute: {
                select: {
                  id: true,
                },
              },
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

      const existingCategoryIds = existingService.categories.map((c) => c.id)
      const categoriesToAdd = input.categories.filter((cId) => !existingCategoryIds.includes(cId))
      const categoriesToRemove = existingCategoryIds.filter((cId) => !input.categories.includes(cId))

      const existingAttributeIds = existingService.attributes.map((a) => a.attributeId)
      const attributesToAdd = input.attributes.filter((aId) => !existingAttributeIds.includes(aId))
      const attributesToRemove = existingAttributeIds.filter((aId) => !input.attributes.includes(aId))

      const {
        web: serviceUrls,
        onion: onionUrls,
        i2p: i2pUrls,
      } = separateServiceUrlsByType(input.allServiceUrls)

      const service = await prisma.service.update({
        where: { id: input.id },
        data: {
          name: input.name,
          description: input.description,
          serviceUrls,
          tosUrls: input.tosUrls,
          onionUrls,
          i2pUrls,
          kycLevel: input.kycLevel,
          verificationStatus: input.verificationStatus,
          verificationSummary: input.verificationSummary,
          verificationProofMd: input.verificationProofMd,
          acceptedCurrencies: input.acceptedCurrencies,
          referral: input.referral,
          serviceVisibility: input.serviceVisibility,
          slug: input.slug,
          overallScore: input.overallScore,
          previousSlugs:
            existingService.slug !== input.slug
              ? {
                  set: uniq([...existingService.previousSlugs, existingService.slug]).filter(
                    (slug) => slug !== input.slug
                  ),
                }
              : undefined,

          imageUrl,
          categories: {
            connect: categoriesToAdd.map((id) => ({ id })),
            disconnect: categoriesToRemove.map((id) => ({ id })),
          },
          attributes: {
            create: attributesToAdd.map((attributeId) => ({
              attribute: {
                connect: { id: attributeId },
              },
            })),

            deleteMany: attributesToRemove.map((attributeId) => ({
              attributeId,
            })),
          },
        },
      })

      return { service }
    },
  }),

  contactMethod: {
    add: defineProtectedAction({
      accept: 'form',
      permissions: 'admin',
      input: z.object({
        label: z.string().min(1).max(50).nullable(),
        value: z.string().url(),
        serviceId: z.number().int().positive(),
      }),
      handler: async (input) => {
        const contactMethod = await prisma.serviceContactMethod.create({
          data: {
            label: input.label,
            value: input.value,
            serviceId: input.serviceId,
          },
        })
        return { contactMethod }
      },
    }),

    update: defineProtectedAction({
      accept: 'form',
      permissions: 'admin',
      input: z.object({
        id: z.number().int().positive(),
        label: z.string().min(1).max(50).nullable(),
        value: z.string().url(),
        serviceId: z.number().int().positive(),
      }),
      handler: async (input) => {
        const contactMethod = await prisma.serviceContactMethod.update({
          where: { id: input.id },
          data: {
            label: input.label,
            value: input.value,
            serviceId: input.serviceId,
          },
        })
        return { contactMethod }
      },
    }),

    delete: defineProtectedAction({
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
  },

  internalNote: {
    add: defineProtectedAction({
      accept: 'form',
      permissions: 'admin',
      input: z.object({
        serviceId: z.number().int().positive(),
        content: z.string().min(1),
      }),
      handler: async (input, { locals }) => {
        const service = await prisma.service.findUnique({
          where: { id: input.serviceId },
        })

        if (!service) {
          throw new ActionError({
            code: 'NOT_FOUND',
            message: 'Service not found',
          })
        }

        await prisma.internalServiceNote.create({
          data: {
            content: input.content,
            serviceId: input.serviceId,
            addedByUserId: locals.user.id,
          },
        })
      },
    }),

    update: defineProtectedAction({
      accept: 'form',
      permissions: 'admin',
      input: z.object({
        noteId: z.number().int().positive(),
        content: z.string().min(1),
      }),
      handler: async (input) => {
        const note = await prisma.internalServiceNote.findUnique({
          where: { id: input.noteId },
        })

        if (!note) {
          throw new ActionError({
            code: 'NOT_FOUND',
            message: 'Note not found',
          })
        }

        await prisma.internalServiceNote.update({
          where: { id: input.noteId },
          data: { content: input.content },
        })
      },
    }),

    delete: defineProtectedAction({
      accept: 'form',
      permissions: 'admin',
      input: z.object({
        noteId: z.number().int().positive(),
      }),
      handler: async (input) => {
        const note = await prisma.internalServiceNote.findUnique({
          where: { id: input.noteId },
        })

        if (!note) {
          throw new ActionError({
            code: 'NOT_FOUND',
            message: 'Note not found',
          })
        }

        await prisma.internalServiceNote.delete({
          where: { id: input.noteId },
        })
      },
    }),
  },
}
