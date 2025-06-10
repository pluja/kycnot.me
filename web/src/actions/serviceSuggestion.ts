import { Currency, KycLevelClarification } from '@prisma/client'
import { z } from 'astro/zod'
import { ActionError } from 'astro:actions'
import { formatDistanceStrict } from 'date-fns'

import { captchaFormSchemaProperties, captchaFormSchemaSuperRefine } from '../lib/captchaValidation'
import { defineProtectedAction } from '../lib/defineProtectedAction'
import { saveFileLocally } from '../lib/fileStorage'
import { findServicesBySimilarity } from '../lib/findServicesBySimilarity'
import { handleHoneypotTrap } from '../lib/honeypot'
import { prisma } from '../lib/prisma'
import { separateServiceUrlsByType } from '../lib/urls'
import {
  imageFileSchemaRequired,
  stringListOfContactMethodsSchema,
  stringListOfUrlsSchemaRequired,
  zodCohercedNumber,
} from '../lib/zodUtils'

import type { Prisma } from '@prisma/client'

const SUGGESTION_MESSAGE_RATE_LIMIT_WINDOW_MINUTES = 1
const MAX_SUGGESTION_MESSAGES_PER_WINDOW = 5

export const SUGGESTION_NOTES_MAX_LENGTH = 1000
export const SUGGESTION_NAME_MAX_LENGTH = 20
export const SUGGESTION_SLUG_MAX_LENGTH = 20
export const SUGGESTION_DESCRIPTION_MAX_LENGTH = 100
export const SUGGESTION_MESSAGE_CONTENT_MAX_LENGTH = 1000

const findPossibleDuplicates = async (input: { name: string }) => {
  const matches = await findServicesBySimilarity(input.name, 0.3)

  return await prisma.service.findMany({
    where: {
      id: {
        in: matches.map(({ id }) => id),
      },
      listedAt: { lte: new Date() },
      serviceVisibility: {
        in: ['PUBLIC', 'ARCHIVED', 'UNLISTED'],
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
    },
  })
}

const serializeExtraNotes = <T extends Record<string, unknown>>(
  input: T,
  skipKeys: (keyof T)[] = []
): string => {
  return Object.entries(input)
    .filter(([key]) => !skipKeys.includes(key as keyof T))
    .map(([key, value]) => {
      let serializedValue = ''
      if (typeof value === 'string') {
        serializedValue = value
      } else if (value === undefined || value === null) {
        serializedValue = ''
      } else if (Array.isArray(value)) {
        serializedValue = value.map((item) => String(item)).join(', ')
      } else if (typeof value === 'object' && 'toString' in value && typeof value.toString === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        serializedValue = value.toString()
      } else {
        try {
          serializedValue = JSON.stringify(value)
        } catch (error) {
          serializedValue = `Error serializing value: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      }
      return `- ${key}: ${serializedValue}`
    })
    .join('\n')
}

export const serviceSuggestionActions = {
  editService: defineProtectedAction({
    accept: 'form',
    permissions: 'not-spammer',
    input: z
      .object({
        notes: z.string().max(SUGGESTION_NOTES_MAX_LENGTH).optional(),
        serviceId: z.coerce.number().int().positive(),
        extraNotes: z.string().optional(),
        /** @deprecated Honey pot field, do not use */
        message: z.unknown().optional(),
        ...captchaFormSchemaProperties,
      })
      .superRefine(captchaFormSchemaSuperRefine),
    handler: async (input, context) => {
      await handleHoneypotTrap({
        input,
        honeyPotTrapField: 'message',
        userId: context.locals.user.id,
        location: 'serviceSuggestion.editService',
      })

      const service = await prisma.service.findUnique({
        select: {
          id: true,
          slug: true,
        },
        where: { id: input.serviceId },
      })

      if (!service) {
        throw new ActionError({
          message: 'Service not found',
          code: 'BAD_REQUEST',
        })
      }

      // Combine notes and extraNotes if available
      const combinedNotes = input.extraNotes
        ? `${input.notes ?? ''}\n\nSuggested changes:\n${input.extraNotes}`
        : input.notes

      const serviceSuggestion = await prisma.serviceSuggestion.create({
        data: {
          type: 'EDIT_SERVICE',
          notes: combinedNotes,
          status: 'PENDING',
          userId: context.locals.user.id,
          serviceId: service.id,
        },
        select: {
          id: true,
        },
      })

      return { serviceSuggestion, service }
    },
  }),
  createService: defineProtectedAction({
    accept: 'form',
    permissions: 'not-spammer',
    input: z
      .object({
        notes: z.string().max(SUGGESTION_NOTES_MAX_LENGTH).optional(),
        name: z.string().min(1).max(SUGGESTION_NAME_MAX_LENGTH),
        slug: z
          .string()
          .min(1)
          .max(SUGGESTION_SLUG_MAX_LENGTH)
          .regex(/^[a-z0-9-]+$/, {
            message: 'Slug must contain only lowercase letters, numbers, and hyphens',
          }),
        description: z.string().min(1).max(SUGGESTION_DESCRIPTION_MAX_LENGTH),
        allServiceUrls: stringListOfUrlsSchemaRequired,
        tosUrls: stringListOfUrlsSchemaRequired,
        contactMethods: stringListOfContactMethodsSchema,
        kycLevel: zodCohercedNumber(z.coerce.number().int().min(0).max(4)),
        kycLevelClarification: z.nativeEnum(KycLevelClarification),
        attributes: z.array(z.coerce.number().int().positive()),
        categories: z.array(z.coerce.number().int().positive()).min(1),
        acceptedCurrencies: z.array(z.nativeEnum(Currency)).min(1),
        imageFile: imageFileSchemaRequired,
        rulesConfirm: z.literal('on', {
          errorMap: () => ({
            message: 'You must accept the suggestion rules and process to continue',
          }),
        }),
        /** @deprecated Honey pot field, do not use */
        message: z.unknown().optional(),
        skipDuplicateCheck: z
          .string()
          .optional()
          .nullable()
          .transform((value) => value === 'true'),
        ...captchaFormSchemaProperties,
      })
      .superRefine(captchaFormSchemaSuperRefine),

    handler: async (input, context) => {
      await handleHoneypotTrap({
        input,
        honeyPotTrapField: 'message',
        userId: context.locals.user.id,
        location: 'serviceSuggestion.createService',
      })

      const serviceWithSameSlug = await prisma.service.findUnique({
        select: { id: true, name: true, slug: true, description: true },
        where: { slug: input.slug },
      })

      if (!input.skipDuplicateCheck) {
        const possibleDuplicates = [
          ...(serviceWithSameSlug ? [serviceWithSameSlug] : []),
          ...(await findPossibleDuplicates(input)),
        ]

        if (possibleDuplicates.length > 0) {
          return {
            hasDuplicates: true,
            possibleDuplicates,
            extraNotes: serializeExtraNotes(input, [
              'skipDuplicateCheck',
              'message',
              'imageFile',
              'captcha-value',
              'captcha-solution-hash',
              'rulesConfirm',
            ]),
            serviceSuggestion: undefined,
            service: undefined,
          } as const
        }
      } else {
        if (serviceWithSameSlug) {
          throw new ActionError({
            message: 'Slug already in use, try a different one',
            code: 'BAD_REQUEST',
          })
        }
      }

      const imageUrl = await saveFileLocally(input.imageFile, input.imageFile.name)

      const {
        web: serviceUrls,
        onion: onionUrls,
        i2p: i2pUrls,
      } = separateServiceUrlsByType(input.allServiceUrls)

      const { serviceSuggestion, service } = await prisma.$transaction(async (tx) => {
        const serviceSelect = {
          id: true,
          slug: true,
        } satisfies Prisma.ServiceSelect

        const service = await tx.service.create({
          data: {
            name: input.name,
            slug: input.slug,
            description: input.description,
            serviceUrls,
            tosUrls: input.tosUrls,
            onionUrls,
            i2pUrls,
            kycLevel: input.kycLevel,
            kycLevelClarification: input.kycLevelClarification,
            acceptedCurrencies: input.acceptedCurrencies,
            imageUrl,
            verificationStatus: 'COMMUNITY_CONTRIBUTED',
            overallScore: 0,
            privacyScore: 0,
            trustScore: 0,
            listedAt: new Date(),
            serviceVisibility: 'UNLISTED',
            categories: {
              connect: input.categories.map((id) => ({ id })),
            },
            attributes: {
              create: input.attributes.map((id) => ({
                attributeId: id,
              })),
            },
            contactMethods: {
              create: input.contactMethods.map((value) => ({
                value,
              })),
            },
          },
          select: serviceSelect,
        })

        const serviceSuggestion = await tx.serviceSuggestion.create({
          data: {
            notes: input.notes,
            type: 'CREATE_SERVICE',
            status: 'PENDING',
            userId: context.locals.user.id,
            serviceId: service.id,
          },
          select: {
            id: true,
          },
        })

        return {
          hasDuplicates: false,
          possibleDuplicates: [],
          extraNotes: undefined,
          serviceSuggestion,
          service,
        } as const
      })

      return {
        hasDuplicates: false,
        possibleDuplicates: [],
        extraNotes: undefined,
        serviceSuggestion,
        service,
      } as const
    },
  }),
  message: defineProtectedAction({
    accept: 'form',
    permissions: 'user',
    input: z.object({
      suggestionId: z.coerce.number().int().positive(),
      content: z.string().min(1).max(SUGGESTION_MESSAGE_CONTENT_MAX_LENGTH),
    }),
    handler: async (input, context) => {
      // --- Rate Limit Check Start --- (Admins are exempt)
      if (!context.locals.user.admin) {
        const windowStart = new Date(Date.now() - SUGGESTION_MESSAGE_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000)
        const recentMessages = await prisma.serviceSuggestionMessage.findMany({
          where: {
            userId: context.locals.user.id,
            createdAt: {
              gte: windowStart,
            },
          },
          select: {
            id: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' }, // Get the oldest first to calculate wait time
        })

        if (recentMessages.length >= MAX_SUGGESTION_MESSAGES_PER_WINDOW) {
          const oldestMessageInWindow = recentMessages[0]
          if (!oldestMessageInWindow) {
            console.error(
              'Error determining oldest message for rate limit, but length check passed. User:',
              context.locals.user.id
            )
            throw new ActionError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Could not determine rate limit window. Please try again.',
            })
          }
          const timeToWait = formatDistanceStrict(oldestMessageInWindow.createdAt, windowStart)
          console.warn(
            `Suggestion message rate limit exceeded for user ${context.locals.user.id.toLocaleString()}`
          )
          throw new ActionError({
            code: 'TOO_MANY_REQUESTS',
            message: `Rate limit exceeded. Please wait ${timeToWait} before sending another message.`,
          })
        }
      }
      // --- Rate Limit Check End ---

      const suggestion = await prisma.serviceSuggestion.findUnique({
        select: {
          id: true,
          userId: true,
        },
        where: { id: input.suggestionId },
      })

      if (!suggestion) {
        throw new ActionError({
          message: 'Suggestion not found',
          code: 'BAD_REQUEST',
        })
      }

      if (suggestion.userId !== context.locals.user.id) {
        throw new ActionError({
          message: 'Not authorized to send messages',
          code: 'UNAUTHORIZED',
        })
      }

      await prisma.serviceSuggestionMessage.create({
        data: {
          content: input.content,
          suggestionId: suggestion.id,
          userId: context.locals.user.id,
        },
      })
    },
  }),
}
