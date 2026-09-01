import { z } from 'astro/zod'
import { ActionError } from 'astro:actions'

import {
  isListingCheckFieldId,
  listingCheckFieldIds,
  listingCheckFieldLabels,
  listingCheckFieldSchemas,
} from '../../../constants/listingCheckFields'
import { recordAuditLog } from '../../../lib/auditLog'
import { defineProtectedAction } from '../../../lib/defineProtectedAction'
import { cap } from '../../../lib/permissions'
import { prisma } from '../../../lib/prisma'

import { buildAuditLines, collectDeclines, intersectAcceptedAttributeIds } from './deepScan.helpers'

// Coerce HTML checkbox values: missing key -> false, "on"/"true"/"1" -> true.
const checkboxBoolean = z
  .union([z.literal('on'), z.literal('true'), z.literal('1'), z.literal(''), z.null()])
  .optional()
  .transform((value) => value === 'on' || value === 'true' || value === '1')

export const deepScanActions = {
  request: defineProtectedAction({
    accept: 'form',
    permissions: cap('services:edit'),
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
    permissions: cap('services:edit'),
    input: z.object({
      suggestionId: z.coerce.number().int().positive(),
      acceptTosReview: checkboxBoolean,
      acceptKycLevel: checkboxBoolean,
      /** Echoed by the form when the level was actually offered as a decision. */
      kycLevelFingerprint: z.string().trim().optional(),
      acceptKycPolicy: checkboxBoolean,
      attributeAddIds: z.array(z.coerce.number().int().positive()),
      attributeRemoveIds: z.array(z.coerce.number().int().positive()),
      listingFields: z.array(z.enum(listingCheckFieldIds)),
    }),
    handler: async (input, { locals }) => {
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
      // Only act on the level when the reviewer was shown it as a decision. A
      // disabled checkbox submits nothing, so without this an untouched, never
      // offered level reads as one they turned down.
      const kycLevelWasOffered =
        !!proposed.kycPolicy.levelFingerprint &&
        input.kycLevelFingerprint === proposed.kycPolicy.levelFingerprint
      const acceptKycLevel = kycLevelWasOffered && input.acceptKycLevel
      const acceptedAdd = intersectAcceptedAttributeIds(input.attributeAddIds, proposed.attributes.add)
      const acceptedRemove = intersectAcceptedAttributeIds(
        input.attributeRemoveIds,
        proposed.attributes.remove
      )

      const auditLines = buildAuditLines({
        inputs: {
          acceptTosReview: input.acceptTosReview,
          acceptKycLevel,
          acceptKycPolicy: input.acceptKycPolicy,
          attributeAddIds: input.attributeAddIds,
          attributeRemoveIds: input.attributeRemoveIds,
        },
        proposedAttributes: proposed.attributes,
        proposedKycLevel: proposed.kycPolicy.inferredLevel,
      })

      // Anything left unticked is a decision, not an oversight. Recording it is
      // what keeps the next scan from asking the same question again.
      const documents = await prisma.serviceLegalDocument.findMany({
        where: { serviceId: suggestion.serviceId },
        select: { urlKey: true, contentHash: true },
      })

      const declines = collectDeclines({
        serviceId: suggestion.serviceId,
        declinedById: locals.user.id,
        proposed,
        documentHashes: new Map(documents.map((doc) => [doc.urlKey, doc.contentHash])),
        acceptedAttributeAdd: acceptedAdd,
        acceptedAttributeRemove: acceptedRemove,
        acceptedListingFields: input.listingFields,
        acceptedKycLevel: !kycLevelWasOffered || input.acceptKycLevel,
      })

      // Two gates, because the field name has two untrusted sources. The form
      // could name a field the scan never raised, and the scan names its own,
      // having read it out of pages the audited service publishes. Neither is
      // allowed to pick which column gets written.
      const acceptedListing = (proposed.listingChecks ?? []).flatMap((check) =>
        isListingCheckFieldId(check.field) && input.listingFields.includes(check.field)
          ? [{ ...check, field: check.field }]
          : []
      )

      // One proposal per field, or which value a ticked box writes depends on
      // the order they were stored in, not on the one the reviewer read.
      const duplicated = acceptedListing.find(
        (check, i) => acceptedListing.findIndex((other) => other.field === check.field) !== i
      )
      if (duplicated) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: `The scan proposed ${listingCheckFieldLabels[duplicated.field]} twice. Edit the service directly instead.`,
        })
      }

      await prisma.$transaction(async (tx) => {
        for (const decline of declines) {
          await tx.serviceScanDecline.upsert({
            // Upsert rather than skip duplicates: declining the same proposal
            // again after its source document moved has to refresh the hash it
            // is held against, or the second decline is silently lost.
            where: {
              serviceId_fingerprint: {
                serviceId: decline.serviceId,
                fingerprint: decline.fingerprint,
              },
            },
            create: decline,
            update: {
              sourceUrlKey: decline.sourceUrlKey,
              sourceContentHash: decline.sourceContentHash,
              declinedById: decline.declinedById,
              label: decline.label,
            },
          })
        }

        // Held to the same rules a person editing the field would be. The value
        // was read out of a document by a model, so it arrives written however
        // the document wrote it, and a country that is not a code cannot go in
        // a column two characters wide. Refusing beats writing something the
        // reviewer did not agree to, or failing halfway through the update.
        const listingUpdate: Record<string, string> = {}
        for (const check of acceptedListing) {
          const parsed = listingCheckFieldSchemas[check.field].safeParse(check.found)
          if (!parsed.success) {
            throw new ActionError({
              code: 'BAD_REQUEST',
              message: `The scan proposed ${JSON.stringify(check.found)} for ${listingCheckFieldLabels[check.field]}, which is not a value that field takes. Edit the service directly instead.`,
            })
          }
          listingUpdate[check.field] = parsed.data
        }

        if (input.acceptTosReview || acceptKycLevel || input.acceptKycPolicy || acceptedListing.length > 0) {
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
              ...(acceptKycLevel ? { kycLevel: proposed.kycPolicy.inferredLevel } : {}),
              ...(input.acceptKycPolicy ? { kycPolicyMd: proposed.kycPolicy.notesMd ?? null } : {}),
              ...listingUpdate,
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

        await tx.serviceSuggestion.update({
          where: { id: suggestion.id },
          data: { status: 'APPROVED' },
        })

        await recordAuditLog(tx, {
          actorId: locals.user.id,
          action: 'STATUS_CHANGED',
          targetType: 'SERVICE_SUGGESTION',
          targetId: suggestion.id,
          summary: auditLines.filter(Boolean).join('; '),
        })
        // Also against the service, so its own trail shows what a scan changed
        // without anyone having to know a suggestion was involved.
        await recordAuditLog(tx, {
          actorId: locals.user.id,
          action: 'UPDATED',
          targetType: 'SERVICE',
          targetId: suggestion.serviceId,
          summary: `Applied deep scan suggestion #${String(suggestion.id)}: ${auditLines.filter(Boolean).join('; ')}`,
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
    permissions: cap('services:edit'),
    input: z.object({
      suggestionId: z.coerce.number().int().positive(),
      reason: z.string().trim().max(500).optional(),
    }),
    handler: async (input, { locals }) => {
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

      const dismissalLine = input.reason ? `Dismissed: ${input.reason}` : 'Dismissed'

      await prisma.$transaction(async (tx) => {
        await tx.serviceSuggestion.update({
          where: { id: input.suggestionId },
          data: { status: 'REJECTED' },
        })
        await recordAuditLog(tx, {
          actorId: locals.user.id,
          action: 'STATUS_CHANGED',
          targetType: 'SERVICE_SUGGESTION',
          targetId: suggestion.id,
          summary: dismissalLine,
        })
      })
    },
  }),
}
