import { ServiceSuggestionStatus } from '@prisma/client'
import { z } from 'astro/zod'
import { ActionError } from 'astro:actions'

import { getServiceEditFieldInfo, serviceEditFieldsZodEnumById } from '../../constants/serviceEditFields'
import { recordAuditLog } from '../../lib/auditLog'
import { defineProtectedAction } from '../../lib/defineProtectedAction'
import { cap } from '../../lib/permissions'
import { prisma } from '../../lib/prisma'
import { sendChatMessageEvents } from '../../lib/sendChatEvents'
import {
  isListFieldEdit,
  listFieldDelta,
  serviceEditableSelect,
  serviceFieldValues,
  serviceUpdateFromFieldEdits,
} from '../../lib/serviceFieldEdits'
import {
  assertCanReviewSuggestion,
  selfReviewNote,
  transitionSuggestion,
} from '../../lib/serviceSuggestionReview'
import { transformCase } from '../../lib/strings'

export const adminServiceSuggestionActions = {
  update: defineProtectedAction({
    accept: 'form',
    permissions: cap('suggestions:manage'),
    input: z.object({
      suggestionId: z.coerce.number().int().positive(),
      status: z.nativeEnum(ServiceSuggestionStatus),
    }),
    handler: async (input, { locals }) => {
      const suggestion = await prisma.serviceSuggestion.findUnique({
        select: {
          id: true,
          status: true,
          serviceId: true,
          userId: true,
          fieldEdits: true,
        },
        where: { id: input.suggestionId },
      })

      if (!suggestion) {
        throw new ActionError({
          code: 'NOT_FOUND',
          message: 'Suggestion not found',
        })
      }
      // An applied edit has already changed the service; reopening it would let
      // the same values be applied again over anything edited since.
      if (suggestion.fieldEdits && suggestion.status === 'APPROVED') {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'This edit was already applied. Suggest a new edit instead of reopening it.',
        })
      }
      if (input.status === 'APPROVED') {
        assertCanReviewSuggestion(suggestion, locals.user)
        // Approving here would credit the author with an edit that was never made.
        if (suggestion.fieldEdits) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: 'Use "Apply selected" to approve an edit, so the changes reach the service.',
          })
        }
      }

      await prisma.$transaction(async (tx) => {
        await transitionSuggestion(tx, suggestion.id, input.status, [suggestion.status])
        await recordAuditLog(tx, {
          actorId: locals.user.id,
          action: 'STATUS_CHANGED',
          targetType: 'SERVICE_SUGGESTION',
          targetId: suggestion.id,
          summary: `Status set to ${transformCase(input.status.replace('_', ' '), 'lower')}, from ${transformCase(suggestion.status.replace('_', ' '), 'lower')}${input.status === 'APPROVED' ? selfReviewNote(suggestion, locals.user) : ''}`,
        })
      })
    },
  }),

  applyFieldEdits: defineProtectedAction({
    accept: 'form',
    permissions: cap('suggestions:manage'),
    input: z.object({
      suggestionId: z.coerce.number().int().positive(),
      fields: z.array(serviceEditFieldsZodEnumById),
      intent: z.enum(['apply', 'reject']).default('apply'),
    }),
    handler: async (input, { locals }) => {
      const suggestion = await prisma.serviceSuggestion.findUnique({
        where: { id: input.suggestionId },
        select: {
          id: true,
          status: true,
          userId: true,
          serviceId: true,
          fieldEdits: true,
        },
      })

      if (!suggestion) {
        throw new ActionError({ code: 'NOT_FOUND', message: 'Suggestion not found' })
      }
      if (!suggestion.fieldEdits) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Suggestion has no field edits to apply.' })
      }
      if (suggestion.status !== 'PENDING' && suggestion.status !== 'UNDER_REVIEW') {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: `Suggestion is already ${suggestion.status.toLowerCase()}.`,
        })
      }
      assertCanReviewSuggestion(suggestion, locals.user)

      if (input.intent === 'reject') {
        await prisma.$transaction(async (tx) => {
          await transitionSuggestion(tx, suggestion.id, 'REJECTED')
          await recordAuditLog(tx, {
            actorId: locals.user.id,
            action: 'STATUS_CHANGED',
            targetType: 'SERVICE_SUGGESTION',
            targetId: suggestion.id,
            summary: 'Rejected all changes',
          })
        })
        return
      }

      const accepted = suggestion.fieldEdits.filter((edit) => input.fields.includes(edit.field))
      const declined = suggestion.fieldEdits.filter((edit) => !input.fields.includes(edit.field))
      if (accepted.length === 0) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'Tick at least one change to apply, or reject the suggestion instead.',
        })
      }

      // Categories and attributes are stored by id, and one being added may
      // have been deleted since the suggestion was made.
      const addedIds = (field: 'attributes' | 'categories') =>
        accepted.flatMap((edit) =>
          edit.field === field && isListFieldEdit(edit) ? listFieldDelta(edit).added.map(Number) : []
        )
      const [categoryCount, attributeCount] = await Promise.all([
        prisma.category.count({ where: { id: { in: addedIds('categories') } } }),
        prisma.attribute.count({ where: { id: { in: addedIds('attributes') } } }),
      ])
      if (
        categoryCount !== addedIds('categories').length ||
        attributeCount !== addedIds('attributes').length
      ) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'A proposed category or attribute no longer exists. Edit the service directly instead.',
        })
      }

      const fieldLabels = (edits: typeof accepted) =>
        edits.map((edit) => getServiceEditFieldInfo(edit.field).label).join(', ')
      const summary =
        [`Applied ${fieldLabels(accepted)}`, declined.length > 0 && `declined ${fieldLabels(declined)}`]
          .filter(Boolean)
          .join('; ') + selfReviewNote(suggestion, locals.user)

      await prisma.$transaction(async (tx) => {
        await transitionSuggestion(tx, suggestion.id, 'APPROVED')

        const liveService = await tx.service.findUniqueOrThrow({
          where: { id: suggestion.serviceId },
          select: serviceEditableSelect,
        })
        await tx.service.update({
          where: { id: suggestion.serviceId },
          data: serviceUpdateFromFieldEdits(accepted, serviceFieldValues(liveService)),
        })
        await recordAuditLog(tx, {
          actorId: locals.user.id,
          action: 'STATUS_CHANGED',
          targetType: 'SERVICE_SUGGESTION',
          targetId: suggestion.id,
          summary,
        })
        await recordAuditLog(tx, {
          actorId: locals.user.id,
          action: 'UPDATED',
          targetType: 'SERVICE',
          targetId: suggestion.serviceId,
          summary: `${summary} from edit suggestion #${String(suggestion.id)}`,
        })

        if (accepted.some((edit) => edit.field === 'attributes')) {
          await tx.serviceScoreRecalculationJob.upsert({
            where: { serviceId: suggestion.serviceId },
            create: { serviceId: suggestion.serviceId },
            update: { processedAt: null, createdAt: new Date() },
          })
        }
      })
    },
  }),

  message: defineProtectedAction({
    accept: 'form',
    permissions: cap('suggestions:manage'),
    input: z.object({
      suggestionId: z.coerce.number().int().positive(),
      content: z.string().min(1).max(1000),
    }),
    handler: async (input, context) => {
      const suggestion = await prisma.serviceSuggestion.findUnique({
        select: {
          id: true,
          userId: true,
        },
        where: { id: input.suggestionId },
      })

      if (!suggestion) {
        throw new Error('Suggestion not found')
      }

      await prisma.serviceSuggestionMessage.create({
        data: {
          content: input.content,
          suggestionId: suggestion.id,
          userId: context.locals.user.id,
        },
      })

      sendChatMessageEvents(suggestion.id, context.locals.user.id).catch(console.error)
    },
  }),
}
