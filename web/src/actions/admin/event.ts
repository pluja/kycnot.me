import { IncidentOutcome, IncidentSeverity, IncidentState, IncidentType } from '@prisma/client'
import { z } from 'astro/zod'
import { ActionError } from 'astro:actions'

import { defineProtectedAction } from '../../lib/defineProtectedAction'
import { EVENT_KINDS, eventKindToFields, type EventKind } from '../../lib/eventKind'
import { cap } from '../../lib/permissions'
import { prisma } from '../../lib/prisma'
import { zodUrlOptionalProtocol } from '../../lib/zodUtils'

const emptyToNull = (val: unknown) => (val === '' || val == null ? null : val)
const emptyToUndefined = (val: unknown) => (val === '' || val == null ? undefined : val)

const endedAtSchema = z.preprocess(emptyToNull, z.coerce.date().nullable().optional())

// source is rendered as a link href on the public events page, so it must be a
// scheme-checked http(s) URL, not a free string (which would accept javascript:).
const sourceSchema = z.preprocess(
  (val) => (val === '' || val == null ? undefined : val),
  zodUrlOptionalProtocol.optional()
)

// Shared event fields. CHANGE is reserved for auto-recorded edits, so the admin
// only ever sets EVENT or INCIDENT; the incident.* fields apply when INCIDENT.
const eventFields = {
  title: z.string().min(1),
  content: z.string().min(1),
  source: sourceSchema,
  kind: z.enum(EVENT_KINDS).default('INFO'),
  startedAt: z.coerce.date(),
  endedAt: endedAtSchema,
  incidentType: z.nativeEnum(IncidentType).default('OTHER'),
  severity: z.preprocess(emptyToUndefined, z.nativeEnum(IncidentSeverity).optional()),
  state: z.nativeEnum(IncidentState).default('ONGOING'),
  occurredAt: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  resolvedAt: z.preprocess(emptyToNull, z.coerce.date().nullable().optional()),
  outcome: z.preprocess(emptyToNull, z.nativeEnum(IncidentOutcome).nullable().optional()),
  amountText: z.preprocess(emptyToNull, z.string().nullable().optional()),
  trustOverride: z.preprocess(emptyToNull, z.coerce.number().int().nullable().optional()),
}

type EventInput = {
  startedAt: Date
  endedAt?: Date | null
  kind: EventKind
  severity?: IncidentSeverity
  incidentType: IncidentType
  state: IncidentState
  occurredAt?: Date
  resolvedAt?: Date | null
  outcome?: IncidentOutcome | null
  amountText?: string | null
  trustOverride?: number | null
}

function refineEvent(data: EventInput, ctx: z.RefinementCtx) {
  if (data.endedAt && data.startedAt > data.endedAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endedAt'],
      message: 'Ended at must be after started at',
    })
  }
  if (data.kind === 'INCIDENT' && !data.severity) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['severity'],
      message: 'Severity is required for incidents',
    })
  }
}

// Builds the Incident create/update payload. A resolved incident anchors its
// decay clock at resolvedAt (falling back to the event's endedAt, then now).
function incidentDataFrom(input: EventInput, severity: IncidentSeverity) {
  const resolved = input.state === 'RESOLVED'
  return {
    type: input.incidentType,
    severity,
    state: input.state,
    occurredAt: input.occurredAt ?? input.startedAt,
    resolvedAt: resolved ? (input.resolvedAt ?? input.endedAt ?? new Date()) : null,
    outcome: resolved ? (input.outcome ?? IncidentOutcome.UNKNOWN) : null,
    amountText: input.amountText ?? null,
    trustOverride: input.trustOverride ?? null,
  }
}

export const adminEventActions = {
  create: defineProtectedAction({
    accept: 'form',
    permissions: cap('events:manage'),
    input: z
      .object({ serviceId: z.coerce.number().int().positive(), ...eventFields })
      .superRefine(refineEvent),
    handler: async (input, context) => {
      const { class: eventClass, sentiment, type } = eventKindToFields(input.kind)
      const event = await prisma.event.create({
        data: {
          serviceId: input.serviceId,
          title: input.title,
          content: input.content,
          source: input.source,
          type,
          class: eventClass,
          sentiment,
          startedAt: input.startedAt,
          endedAt: input.endedAt,
          visible: true,
          createdById: context.locals.user.id,
        },
        select: { id: true },
      })

      if (input.kind === 'INCIDENT' && input.severity) {
        await prisma.incident.create({
          data: { eventId: event.id, ...incidentDataFrom(input, input.severity) },
        })
      }
      return { event }
    },
  }),

  toggle: defineProtectedAction({
    accept: 'form',
    permissions: cap('events:manage'),
    input: z.object({
      eventId: z.coerce.number().int().positive(),
    }),
    handler: async (input, context) => {
      const existingEvent = await prisma.event.findUnique({ where: { id: input.eventId } })
      if (!existingEvent) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'Event not found',
        })
      }

      const event = await prisma.event.update({
        where: { id: input.eventId },
        data: {
          visible: !existingEvent.visible,
          updatedById: context.locals.user.id,
        },
        select: {
          id: true,
        },
      })
      return { event }
    },
  }),

  update: defineProtectedAction({
    accept: 'form',
    permissions: cap('events:manage'),
    input: z.object({ eventId: z.coerce.number().int().positive(), ...eventFields }).superRefine(refineEvent),
    handler: async (input, context) => {
      const existingEvent = await prisma.event.findUnique({ where: { id: input.eventId } })
      if (!existingEvent) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'Event not found',
        })
      }

      const { class: eventClass, sentiment, type } = eventKindToFields(input.kind)
      await prisma.event.update({
        where: { id: input.eventId },
        data: {
          title: input.title,
          content: input.content,
          source: input.source,
          type,
          class: eventClass,
          sentiment,
          startedAt: input.startedAt,
          endedAt: input.endedAt,
          updatedById: context.locals.user.id,
        },
      })

      if (input.kind === 'INCIDENT' && input.severity) {
        const incidentData = incidentDataFrom(input, input.severity)
        await prisma.incident.upsert({
          where: { eventId: input.eventId },
          create: { eventId: input.eventId, ...incidentData },
          update: incidentData,
        })
      } else {
        // No longer an incident: drop any detail so it stops penalizing trust.
        await prisma.incident.deleteMany({ where: { eventId: input.eventId } })
      }

      return { event: { id: input.eventId } }
    },
  }),

  // Quick-resolve an ongoing incident: stamps the resolution and ends the event,
  // which kicks off the decay from now.
  resolve: defineProtectedAction({
    accept: 'form',
    permissions: cap('events:manage'),
    input: z.object({
      eventId: z.coerce.number().int().positive(),
      outcome: z.nativeEnum(IncidentOutcome).default('UNKNOWN'),
      resolvedAt: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
    }),
    handler: async (input, context) => {
      const incident = await prisma.incident.findUnique({ where: { eventId: input.eventId } })
      if (!incident) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'No incident for this event' })
      }

      const resolvedAt = input.resolvedAt ?? new Date()
      await prisma.incident.update({
        where: { eventId: input.eventId },
        data: { state: 'RESOLVED', resolvedAt, outcome: input.outcome },
      })
      await prisma.event.update({
        where: { id: input.eventId },
        data: { endedAt: resolvedAt, updatedById: context.locals.user.id },
      })
      return { event: { id: input.eventId } }
    },
  }),

  // Soft delete: recoverable. Hides the event everywhere public (which all
  // filter `visible: true`) while keeping it in the admin manager for restore.
  delete: defineProtectedAction({
    accept: 'form',
    permissions: cap('events:manage'),
    input: z.object({
      eventId: z.coerce.number().int().positive(),
    }),
    handler: async (input, context) => {
      const event = await prisma.event.update({
        where: { id: input.eventId },
        data: { deletedAt: new Date(), visible: false, updatedById: context.locals.user.id },
        select: { id: true },
      })
      return { event }
    },
  }),

  restore: defineProtectedAction({
    accept: 'form',
    permissions: cap('events:manage'),
    input: z.object({
      eventId: z.coerce.number().int().positive(),
    }),
    handler: async (input, context) => {
      const event = await prisma.event.update({
        where: { id: input.eventId },
        data: { deletedAt: null, visible: true, updatedById: context.locals.user.id },
        select: { id: true },
      })
      return { event }
    },
  }),

  // Permanent delete: admins only, so managers cannot destroy events.
  purge: defineProtectedAction({
    accept: 'form',
    permissions: 'admin',
    input: z.object({
      eventId: z.coerce.number().int().positive(),
    }),
    handler: async (input) => {
      const event = await prisma.event.delete({ where: { id: input.eventId } })
      return { event }
    },
  }),
}
