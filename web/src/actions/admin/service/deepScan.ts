import { z } from 'astro/zod'
import { ActionError } from 'astro:actions'

import { defineProtectedAction } from '../../../lib/defineProtectedAction'
import { prisma } from '../../../lib/prisma'

import { buildAuditLines, intersectAcceptedAttributeIds } from './deepScan.helpers'

// Coerce HTML checkbox values: missing key -> false, "on"/"true"/"1" -> true.
const checkboxBoolean = z
  .union([z.literal('on'), z.literal('true'), z.literal('1'), z.literal(''), z.null()])
  .optional()
  .transform((value) => value === 'on' || value === 'true' || value === '1')

const formNumberArray = z
  .union([
    z.array(z.coerce.number().int().positive()),
    z.coerce.number().int().positive(),
    z.literal(''),
    z.null(),
  ])
  .optional()
  .transform((value) => {
    if (value === undefined || value === null || value === '') return []
    return Array.isArray(value) ? value : [value]
  })

export const deepScanActions = {
  request: defineProtectedAction({
    accept: 'form',
    permissions: 'admin',
    input: z.object({
      serviceId: z.coerce.number().int().positive(),
    }),
    handler: async (input, { locals }) => {
      const service = await prisma.service.findUnique({
        where: { id: input.serviceId },
        select: { id: true, tosUrls: true },
      })
      if (!service) {
        throw new ActionError({ code: 'NOT_FOUND', message: 'Service not found' })
      }
      if (service.tosUrls.length === 0) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'Service has no ToS URLs to scan.',
        })
      }

      await prisma.serviceScanJob.upsert({
        where: { serviceId: input.serviceId },
        create: {
          serviceId: input.serviceId,
          requestedByUserId: locals.user.id,
        },
        update: {
          requestedByUserId: locals.user.id,
          createdAt: new Date(),
          claimedAt: null,
          processedAt: null,
          error: null,
        },
      })
    },
  }),

  apply: defineProtectedAction({
    accept: 'form',
    permissions: 'admin',
    input: z.object({
      suggestionId: z.coerce.number().int().positive(),
      acceptTosReview: checkboxBoolean,
      acceptKycLevel: checkboxBoolean,
      acceptKycPolicy: checkboxBoolean,
      attributeAddIds: formNumberArray,
      attributeRemoveIds: formNumberArray,
    }),
    handler: async (input) => {
      const suggestion = await prisma.serviceSuggestion.findUnique({
        where: { id: input.suggestionId },
        select: {
          id: true,
          status: true,
          serviceId: true,
          proposedEdits: true,
          notes: true,
        },
      })

      if (!suggestion) {
        throw new ActionError({ code: 'NOT_FOUND', message: 'Suggestion not found' })
      }
      if (!suggestion.proposedEdits) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'Suggestion has no proposed edits to apply.',
        })
      }
      if (suggestion.status !== 'PENDING' && suggestion.status !== 'UNDER_REVIEW') {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: `Suggestion is already ${suggestion.status.toLowerCase()}.`,
        })
      }

      const proposed = suggestion.proposedEdits
      const acceptedAdd = intersectAcceptedAttributeIds(
        input.attributeAddIds,
        proposed.attributes.add
      )
      const acceptedRemove = intersectAcceptedAttributeIds(
        input.attributeRemoveIds,
        proposed.attributes.remove
      )

      const auditLines = buildAuditLines({
        inputs: {
          acceptTosReview: input.acceptTosReview,
          acceptKycLevel: input.acceptKycLevel,
          acceptKycPolicy: input.acceptKycPolicy,
          attributeAddIds: input.attributeAddIds,
          attributeRemoveIds: input.attributeRemoveIds,
        },
        proposedAttributes: proposed.attributes,
        proposedKycLevel: proposed.kycPolicy.inferredLevel,
      })

      await prisma.$transaction(async (tx) => {
        if (input.acceptTosReview || input.acceptKycLevel || input.acceptKycPolicy) {
          await tx.service.update({
            where: { id: suggestion.serviceId },
            data: {
              ...(input.acceptTosReview
                ? {
                    tosReview: {
                      contentHash: proposed.contentHash,
                      ...proposed.tosReview,
                    },
                    tosReviewAt: new Date(),
                  }
                : {}),
              ...(input.acceptKycLevel ? { kycLevel: proposed.kycPolicy.inferredLevel } : {}),
              ...(input.acceptKycPolicy
                ? { kycPolicyMd: proposed.kycPolicy.notesMd ?? null }
                : {}),
            },
          })
        }

        if (acceptedAdd.length > 0) {
          await tx.serviceAttribute.createMany({
            data: acceptedAdd.map((attributeId) => ({
              serviceId: suggestion.serviceId,
              attributeId,
            })),
            skipDuplicates: true,
          })
        }

        if (acceptedRemove.length > 0) {
          await tx.serviceAttribute.deleteMany({
            where: {
              serviceId: suggestion.serviceId,
              attributeId: { in: acceptedRemove },
            },
          })
        }

        const newNotes = [suggestion.notes, '', auditLines.join('\n')]
          .filter((line) => line !== null)
          .join('\n')
          .trim()

        await tx.serviceSuggestion.update({
          where: { id: suggestion.id },
          data: { status: 'APPROVED', notes: newNotes },
        })

        if (acceptedAdd.length > 0 || acceptedRemove.length > 0) {
          await tx.serviceScoreRecalculationJob.upsert({
            where: { serviceId: suggestion.serviceId },
            create: { serviceId: suggestion.serviceId },
            update: { processedAt: null, createdAt: new Date() },
          })
        }
      })
    },
  }),

  dismiss: defineProtectedAction({
    accept: 'form',
    permissions: 'admin',
    input: z.object({
      suggestionId: z.coerce.number().int().positive(),
      reason: z.string().trim().max(500).optional(),
    }),
    handler: async (input) => {
      const suggestion = await prisma.serviceSuggestion.findUnique({
        where: { id: input.suggestionId },
        select: { id: true, status: true, notes: true, proposedEdits: true },
      })

      if (!suggestion) {
        throw new ActionError({ code: 'NOT_FOUND', message: 'Suggestion not found' })
      }
      if (!suggestion.proposedEdits) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'Suggestion has no proposed edits to dismiss.',
        })
      }
      if (suggestion.status !== 'PENDING' && suggestion.status !== 'UNDER_REVIEW') {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: `Suggestion is already ${suggestion.status.toLowerCase()}.`,
        })
      }

      const dismissalLine = input.reason
        ? `Dismissed by admin: ${input.reason}`
        : 'Dismissed by admin'
      const newNotes = [suggestion.notes, '', dismissalLine]
        .filter((line) => line !== null)
        .join('\n')
        .trim()

      await prisma.serviceSuggestion.update({
        where: { id: input.suggestionId },
        data: { status: 'REJECTED', notes: newNotes },
      })
    },
  }),
}
