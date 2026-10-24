import { Currency, ServiceVisibility, VerificationStatus } from '@prisma/client'
import { z } from 'astro/zod'
import { ActionError } from 'astro:actions'
import { uniq } from 'lodash-es'
import slugify from 'slugify'

import { countriesZodEnumByCode } from '../../constants/countries'
import { recordAuditLog } from '../../lib/auditLog'
import { reclassifyServiceProof } from '../../lib/commentProof'
import { defineProtectedAction } from '../../lib/defineProtectedAction'
import {
  checkDescription,
  describeViolations,
  descriptionOpeningRefinement,
  descriptionSchema,
} from '../../lib/descriptionRules'
import { deleteFileLocally, PICTURE_SIZE, saveImageUpload } from '../../lib/fileStorage'
import { cap, userCan } from '../../lib/permissions'
import { prisma } from '../../lib/prisma'
import { proofIdRegex } from '../../lib/proofEvidence'
import { normalizeText } from '../../lib/serviceFieldEdits'
import { separateServiceUrlsByType } from '../../lib/urls'
import {
  imageFileSchema,
  stringListOfContactMethodsSchema,
  stringListOfUrlsSchemaRequired,
  zodContactMethod,
} from '../../lib/zodUtils'

import { deepScanActions } from './service/deepScan'
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
  description: z.string().trim().min(1),
  allServiceUrls: stringListOfUrlsSchemaRequired,
  tosUrls: stringListOfUrlsSchemaRequired,
  contactMethods: stringListOfContactMethodsSchema,
  kycLevel: z.coerce.number().int().min(0).max(4),
  kycPolicyMd: z.string().trim().max(4000).optional().nullable().default(null),
  attributes: z.array(z.coerce.number().int().positive()),
  // Parallel arrays because HTML form data has no nested objects. Zipped below;
  // a note only applies if its attribute is still assigned.
  attributeNoteIds: z.array(z.coerce.number().int().positive()).default([]),
  attributeNotes: z.array(z.string().max(300)).default([]),
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
  proofHint: z.string().trim().max(300).nullish(),
  proofLookupUrl: z
    .string()
    .trim()
    .max(300)
    .refine((value) => /^https:\/\/[^\s{}]+\{id\}[^\s{}]*$/.test(value), {
      message: 'Use an https URL with a single {id} placeholder.',
    })
    .nullish(),
  proofIdPattern: z
    .string()
    .trim()
    .max(200)
    .refine((value) => proofIdRegex(value) !== null, {
      message: 'Use a valid pattern without groups, e.g. [A-Z0-9]{6} or [A-Z]{6}|[0-9]{8}.',
    })
    .nullish(),
})

// Define schema for the create action input
const createServiceInputSchema = serviceSchemaBase
  .omit({ id: true })
  .extend({ description: descriptionSchema })
  .superRefine(descriptionOpeningRefinement)
  .transform(addSlugIfMissing)

// Define schema for the update action input
// The rule applies to text being written, not to text on record: an admin
// fixing a URL must not be blocked by a description nobody touched. The
// update handler checks the description only when it changed.
const updateServiceInputSchema = serviceSchemaBase
  .extend({
    removeImage: z.boolean().optional(),
  })
  .transform(addSlugIfMissing)

const evidenceImageAddSchema = z.object({
  serviceId: z.number().int().positive(),
  imageFile: imageFileSchema,
  watermark: z.coerce.boolean().default(false),
})

const evidenceImageDeleteSchema = z.object({
  fileUrl: z.string().regex(/^\/files\/evidence\/[\w-]+\/\w[\w.-]*$/, 'Must be a valid evidence file URL'),
})

export const adminServiceActions = {
  create: defineProtectedAction({
    accept: 'form',
    permissions: cap('services:edit'),
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
        ? await saveImageUpload(input.imageFile, 'services/pictures', PICTURE_SIZE)
        : undefined

      // Setting the verification status is gated by services:approve; others
      // (e.g. support) create services as community-contributed.
      const resolvedVerificationStatus = userCan(context.locals.user, 'services:approve')
        ? input.verificationStatus
        : VerificationStatus.COMMUNITY_CONTRIBUTED

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
          verificationStatus: resolvedVerificationStatus,
          verificationSummary: input.verificationSummary,
          verificationProofMd: input.verificationProofMd,
          acceptedCurrencies: input.acceptedCurrencies,
          strictCommentingEnabled: input.strictCommentingEnabled,
          proofHint: input.proofHint || null,
          proofLookupUrl: input.proofLookupUrl || null,
          proofIdPattern: input.proofIdPattern || null,
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
    permissions: cap('services:edit'),
    input: updateServiceInputSchema,
    handler: async (input: z.infer<typeof updateServiceInputSchema>, context) => {
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
          description: true,
          previousSlugs: true,
          proofLookupUrl: true,
          proofIdPattern: true,
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

      if (normalizeText(input.description) !== normalizeText(existingService.description)) {
        const broken = describeViolations(checkDescription(input.description, input.name))
        if (broken.length > 0) {
          throw new ActionError({ code: 'BAD_REQUEST', message: `Description: ${broken.join(' ')}` })
        }
      }
      const existingCategoryIds = existingService.categories.map((c) => c.id)
      const categoriesToAdd = input.categories.filter((cId) => !existingCategoryIds.includes(cId))
      const categoriesToRemove = existingCategoryIds.filter((cId) => !input.categories.includes(cId))

      const existingAttributeIds = existingService.attributes.map((a) => a.attributeId)
      const attributesToAdd = input.attributes.filter((aId) => !existingAttributeIds.includes(aId))
      const attributesToRemove = existingAttributeIds.filter((aId) => !input.attributes.includes(aId))

      // Notes are presentational, so they are written after the add/remove diff
      // and only for attributes the service still has. Blank clears the note.
      const noteUpdates = input.attributeNoteIds
        .map((attributeId, index) => ({ attributeId, note: input.attributeNotes[index]?.trim() ?? '' }))
        .filter(({ attributeId }) => input.attributes.includes(attributeId))

      const imageUrl = input.removeImage
        ? null
        : input.imageFile
          ? await saveImageUpload(input.imageFile, 'services/pictures', PICTURE_SIZE)
          : undefined

      // Changing the verification status is gated by services:approve; for
      // others (e.g. support) it is left untouched.
      const resolvedVerificationStatus = userCan(context.locals.user, 'services:approve')
        ? input.verificationStatus
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
          verificationStatus: resolvedVerificationStatus,
          verificationSummary: input.verificationSummary,
          verificationProofMd: input.verificationProofMd,
          acceptedCurrencies: input.acceptedCurrencies,
          strictCommentingEnabled: input.strictCommentingEnabled,
          proofHint: input.proofHint || null,
          proofLookupUrl: input.proofLookupUrl || null,
          proofIdPattern: input.proofIdPattern || null,
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

            updateMany: noteUpdates.map(({ attributeId, note }) => ({
              where: { attributeId },
              data: { note: note || null },
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
      if (
        (input.proofLookupUrl || null) !== existingService.proofLookupUrl ||
        (input.proofIdPattern || null) !== existingService.proofIdPattern
      ) {
        await reclassifyServiceProof(input.id)
      }

      return { service }
    },
  }),

  contactMethod: {
    add: defineProtectedAction({
      accept: 'form',
      permissions: cap('services:edit'),
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
      permissions: cap('services:edit'),
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
      permissions: cap('services:edit'),
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
      permissions: cap('services:edit'),
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
      permissions: cap('services:edit'),
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
      permissions: cap('services:edit'),
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

  deepScan: deepScanActions,

  evidenceImage: {
    add: defineProtectedAction({
      accept: 'form',
      permissions: cap('services:edit'),
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

        const imageUrl = await saveImageUpload(input.imageFile, `evidence/${service.slug}`, {
          watermark: input.watermark,
        })

        return { imageUrl }
      },
    }),
    delete: defineProtectedAction({
      accept: 'form',
      permissions: cap('services:edit'),
      input: evidenceImageDeleteSchema,
      handler: async (input, context) => {
        const slug = input.fileUrl.split('/')[3]
        const service = await prisma.service.findUnique({ where: { slug }, select: { id: true } })
        if (!service) throw new ActionError({ code: 'NOT_FOUND', message: 'Service not found' })
        await deleteFileLocally(input.fileUrl)
        await recordAuditLog(prisma, {
          actorId: context.locals.user.id,
          action: 'DELETED',
          targetType: 'SERVICE',
          targetId: service.id,
          summary: `Deleted evidence image ${input.fileUrl.split('/').at(-1) ?? ''}`,
        })
      },
    }),
  },
}
