import { Currency, ServiceVisibility, VerificationStatus } from '@prisma/client'
import { z } from 'astro/zod'
import { ActionError } from 'astro:actions'
import { uniq } from 'lodash-es'
import slugify from 'slugify'

import { countriesZodEnumByCode } from '../../constants/countries'
import { defineProtectedAction } from '../../lib/defineProtectedAction'
import { saveFileLocally, deleteFileLocally } from '../../lib/fileStorage'
import { prisma } from '../../lib/prisma'
import { separateServiceUrlsByType } from '../../lib/urls'
import {
  imageFileSchema,
  stringListOfContactMethodsSchema,
  stringListOfUrlsSchemaRequired,
  zodContactMethod,
} from '../../lib/zodUtils'

import { tosHighlightActions } from './service/tosHighlight'

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
  contactMethods: stringListOfContactMethodsSchema,
  kycLevel: z.coerce.number().int().min(0).max(4),
  kycPolicyMd: z.string().trim().max(4000).optional().nullable().default(null),
  attributes: z.array(z.coerce.number().int().positive()),
  categories: z.array(z.coerce.number().int().positive()).min(1),
  verificationStatus: z.nativeEnum(VerificationStatus),
  verificationSummary: z.string().optional().nullable().default(null),
  verificationProofMd: z.string().optional().nullable().default(null),
  acceptedCurrencies: z.array(z.nativeEnum(Currency)).min(1),
  referral: z
    .string()
    .regex(/^(\?\w+=.|\/.+)/, 'Referral must be a valid URL parameter or path, not a full URL')
    .optional()
    .nullable()
    .default(null),
  operatingSince: z.coerce.date().optional().nullable(),
  registrationCountryCode: z
    .union([countriesZodEnumByCode, z.literal('')])
    .optional()
    .nullable()
    .refine((val) => val === null || val === undefined || val === '' || val.length === 2, {
      message: 'Country code must be a valid 2-character code or empty',
    }),
  registeredCompanyName: z.string().trim().max(100).optional().nullable(),
  imageFile: imageFileSchema,
  serviceVisibility: z.nativeEnum(ServiceVisibility),
  internalNote: z.string().optional(),
  strictCommentingEnabled: z.boolean().optional().default(false),
  commentSectionMessage: z.string().trim().min(3).max(1000).optional().nullable().default(null),
})

// Define schema for the create action input
const createServiceInputSchema = serviceSchemaBase.omit({ id: true }).transform(addSlugIfMissing)

// Define schema for the update action input
const updateServiceInputSchema = serviceSchemaBase
  .extend({
    removeImage: z.boolean().optional(),
  })
  .transform(addSlugIfMissing)

const evidenceImageAddSchema = z.object({
  serviceId: z.number().int().positive(),
  imageFile: imageFileSchema,
})

const evidenceImageDeleteSchema = z.object({
  fileUrl: z.string().startsWith('/files/evidence/', 'Must be a valid evidence file URL'),
})

export const adminServiceActions = {
  create: defineProtectedAction({
    accept: 'form',
    permissions: 'admin',
    input: createServiceInputSchema,
    handler: async (input: z.infer<typeof createServiceInputSchema>, context) => {
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
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          kycPolicyMd: input.kycPolicyMd || null,
          verificationStatus: input.verificationStatus,
          verificationSummary: input.verificationSummary,
          verificationProofMd: input.verificationProofMd,
          acceptedCurrencies: input.acceptedCurrencies,
          strictCommentingEnabled: input.strictCommentingEnabled,
          commentSectionMessage: input.commentSectionMessage,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          referral: input.referral || null,
          serviceVisibility: input.serviceVisibility,
          slug: input.slug,
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
          contactMethods: {
            create: input.contactMethods.map((value) => ({
              value,
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
          operatingSince: input.operatingSince,
          registrationCountryCode: input.registrationCountryCode ?? null,
          registeredCompanyName: input.registeredCompanyName,
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
    input: updateServiceInputSchema,
    handler: async (input: z.infer<typeof updateServiceInputSchema>) => {
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

      const imageUrl = input.removeImage
        ? null
        : input.imageFile
          ? await saveFileLocally(input.imageFile, input.imageFile.name)
          : undefined

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
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          kycPolicyMd: input.kycPolicyMd || null,
          verificationStatus: input.verificationStatus,
          verificationSummary: input.verificationSummary,
          verificationProofMd: input.verificationProofMd,
          acceptedCurrencies: input.acceptedCurrencies,
          strictCommentingEnabled: input.strictCommentingEnabled,
          commentSectionMessage: input.commentSectionMessage,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          referral: input.referral || null,
          serviceVisibility: input.serviceVisibility,
          slug: input.slug,
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
          operatingSince: input.operatingSince,
          registrationCountryCode: input.registrationCountryCode ?? null,
          registeredCompanyName: input.registeredCompanyName,
        },
        select: {
          id: true,
          slug: true,
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
        value: zodContactMethod,
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
        value: zodContactMethod,
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

  tosHighlight: tosHighlightActions,

  evidenceImage: {
    add: defineProtectedAction({
      accept: 'form',
      permissions: 'admin',
      input: evidenceImageAddSchema,
      handler: async (input) => {
        const service = await prisma.service.findUnique({
          where: { id: input.serviceId },
          select: { slug: true },
        })

        if (!service) {
          throw new ActionError({
            code: 'NOT_FOUND',
            message: 'Service not found to associate image with.',
          })
        }

        if (!input.imageFile) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: 'Image file is required.',
          })
        }

        const imageUrl = await saveFileLocally(
          input.imageFile,
          input.imageFile.name,
          `evidence/${service.slug}`
        )

        return { imageUrl }
      },
    }),
    delete: defineProtectedAction({
      accept: 'form',
      permissions: 'admin',
      input: evidenceImageDeleteSchema,
      handler: async (input) => {
        await deleteFileLocally(input.fileUrl)
      },
    }),
  },
}
