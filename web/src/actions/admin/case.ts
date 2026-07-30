import { CaseEvidenceType, CaseIssueType, CaseStatus, CaseVisibility } from '@prisma/client'
import { z } from 'astro/zod'
import { ActionError } from 'astro:actions'

import { canParticipateInCase, isCaseStaff, isCasePublished } from '../../lib/caseAccess'
import { defineProtectedAction } from '../../lib/defineProtectedAction'
import { deleteFileLocally, saveFileLocally } from '../../lib/fileStorage'
import { prisma } from '../../lib/prisma'
import { imageFileSchema } from '../../lib/zodUtils'

import type { Capability } from '../../constants/capabilities'

const manageCases = { capability: 'cases:manage' } satisfies { capability: Capability }

// Astro coerces empty/absent form fields to null before zod runs, so optional
// fields must treat null (and '') as "not provided".
const emptyToUndefined = (value: unknown) => (value === '' || value === null ? undefined : value)
const optionalText = z.preprocess(emptyToUndefined, z.string().optional())
const optionalPositiveInt = z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional())
const optionalDate = z.preprocess(emptyToUndefined, z.coerce.date().optional())

// externalSource is rendered as a link href, so only http(s) URLs are accepted.
// This blocks javascript:/data: and other script-capable schemes at the source.
const optionalHttpUrl = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .trim()
    .url()
    .refine((value) => /^https?:\/\//i.test(value), 'Source must start with http:// or https://')
    .optional()
)

// resolvedAt is stamped when a case enters RESOLVED and kept if already set;
// any other status clears it.
function resolvedAtFor(status: CaseStatus, existing: Date | null): Date | null {
  if (status !== CaseStatus.RESOLVED) return null
  return existing ?? new Date()
}

// publishedAt marks the first time a case became publicly reachable and is never
// rewritten, so pulling a case back to DRAFT and republishing keeps its original
// place in the public listing.
function publishedAtFor(status: CaseStatus, existing: Date | null): Date | null {
  if (existing) return existing
  return isCasePublished(status) ? new Date() : null
}

async function assertReporterExists(reportedById: number | null | undefined) {
  if (!reportedById) return
  const reporter = await prisma.user.findUnique({ where: { id: reportedById }, select: { id: true } })
  if (!reporter) {
    throw new ActionError({ code: 'BAD_REQUEST', message: 'Reporter user not found' })
  }
}

export const adminCaseActions = {
  create: defineProtectedAction({
    accept: 'form',
    permissions: manageCases,
    input: z.object({
      serviceId: z.coerce.number().int().positive(),
      title: z.string().min(1).max(200),
      issueType: z.nativeEnum(CaseIssueType),
      status: z.nativeEnum(CaseStatus).default(CaseStatus.DRAFT),
      summaryMd: z.string().min(1),
      amountText: optionalText,
      externalSource: optionalHttpUrl,
      occurredAt: optionalDate,
      reportedById: optionalPositiveInt,
    }),
    handler: async (input, context) => {
      const service = await prisma.service.findUnique({
        where: { id: input.serviceId },
        select: { id: true },
      })
      if (!service) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Service not found' })
      }
      await assertReporterExists(input.reportedById)

      const newCase = await prisma.case.create({
        data: {
          title: input.title,
          issueType: input.issueType,
          status: input.status,
          summaryMd: input.summaryMd,
          amountText: input.amountText,
          externalSource: input.externalSource,
          occurredAt: input.occurredAt,
          publishedAt: publishedAtFor(input.status, null),
          service: { connect: { id: input.serviceId } },
          createdBy: { connect: { id: context.locals.user.id } },
          ...(input.reportedById ? { reportedBy: { connect: { id: input.reportedById } } } : {}),
        },
        select: { id: true },
      })

      return { case: newCase }
    },
  }),

  update: defineProtectedAction({
    accept: 'form',
    permissions: manageCases,
    input: z.object({
      caseId: z.coerce.number().int().positive(),
      title: z.string().min(1).max(200),
      issueType: z.nativeEnum(CaseIssueType),
      status: z.nativeEnum(CaseStatus),
      summaryMd: z.string().min(1),
      amountText: optionalText,
      externalSource: optionalHttpUrl,
      occurredAt: optionalDate,
      resolutionMd: optionalText,
      reportedById: z.preprocess(
        (value) => (value === '' || value === null ? null : value),
        z.coerce.number().int().positive().nullable()
      ),
    }),
    handler: async (input) => {
      const existing = await prisma.case.findUnique({
        where: { id: input.caseId },
        select: { id: true, resolvedAt: true, publishedAt: true },
      })
      if (!existing) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Case not found' })
      }
      await assertReporterExists(input.reportedById)

      const updated = await prisma.case.update({
        where: { id: input.caseId },
        data: {
          title: input.title,
          issueType: input.issueType,
          status: input.status,
          summaryMd: input.summaryMd,
          amountText: input.amountText ?? null,
          externalSource: input.externalSource ?? null,
          occurredAt: input.occurredAt ?? null,
          resolutionMd: input.resolutionMd ?? null,
          resolvedAt: resolvedAtFor(input.status, existing.resolvedAt),
          publishedAt: publishedAtFor(input.status, existing.publishedAt),
          reportedBy: input.reportedById ? { connect: { id: input.reportedById } } : { disconnect: true },
        },
        select: { id: true },
      })

      return { case: updated }
    },
  }),

  setStatus: defineProtectedAction({
    accept: 'form',
    permissions: manageCases,
    input: z.object({
      caseId: z.coerce.number().int().positive(),
      status: z.nativeEnum(CaseStatus),
    }),
    handler: async (input) => {
      const existing = await prisma.case.findUnique({
        where: { id: input.caseId },
        select: { id: true, resolvedAt: true, publishedAt: true },
      })
      if (!existing) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Case not found' })
      }

      const updated = await prisma.case.update({
        where: { id: input.caseId },
        data: {
          status: input.status,
          resolvedAt: resolvedAtFor(input.status, existing.resolvedAt),
          publishedAt: publishedAtFor(input.status, existing.publishedAt),
        },
        select: { id: true },
      })

      return { case: updated }
    },
  }),

  linkIncident: defineProtectedAction({
    accept: 'form',
    permissions: manageCases,
    input: z.object({
      caseId: z.coerce.number().int().positive(),
      // Empty clears the link.
      incidentId: z.preprocess(
        (value) => (value === '' || value === null ? null : value),
        z.coerce.number().int().positive().nullable()
      ),
    }),
    handler: async (input) => {
      const existing = await prisma.case.findUnique({
        where: { id: input.caseId },
        select: { id: true, serviceId: true },
      })
      if (!existing) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Case not found' })
      }

      if (input.incidentId !== null) {
        // A cross-service link would list this report under an unrelated
        // service's incident, so the incident must belong to the same service.
        const incident = await prisma.incident.findUnique({
          where: { id: input.incidentId },
          select: { id: true, event: { select: { serviceId: true } } },
        })
        if (!incident) {
          throw new ActionError({ code: 'BAD_REQUEST', message: 'Incident not found' })
        }
        if (incident.event.serviceId !== existing.serviceId) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: 'That incident belongs to a different service',
          })
        }
      }

      const updated = await prisma.case.update({
        where: { id: input.caseId },
        data:
          input.incidentId === null
            ? { incident: { disconnect: true } }
            : { incident: { connect: { id: input.incidentId } } },
        select: { id: true, incidentId: true },
      })

      return { case: updated }
    },
  }),

  delete: defineProtectedAction({
    accept: 'form',
    permissions: manageCases,
    input: z.object({ caseId: z.coerce.number().int().positive() }),
    handler: async (input) => {
      const evidence = await prisma.caseEvidence.findMany({
        where: { caseId: input.caseId },
        select: { imageUrl: true },
      })
      const deleted = await prisma.case.delete({ where: { id: input.caseId }, select: { id: true } })

      for (const item of evidence) {
        if (item.imageUrl) {
          try {
            await deleteFileLocally(item.imageUrl)
          } catch (error: unknown) {
            console.error('Failed to delete case evidence image:', error)
          }
        }
      }

      return { case: deleted }
    },
  }),

  updates: {
    add: defineProtectedAction({
      accept: 'form',
      permissions: 'not-spammer',
      input: z.object({
        caseId: z.coerce.number().int().positive(),
        bodyMd: z.string().min(1),
        visibility: z.nativeEnum(CaseVisibility).default(CaseVisibility.PARTICIPANTS),
      }),
      handler: async (input, context) => {
        const caseRow = await prisma.case.findUnique({
          where: { id: input.caseId },
          select: {
            status: true,
            reportedById: true,
            participants: { select: { id: true } },
            service: { select: { affiliatedUsers: { select: { userId: true } } } },
          },
        })
        if (!caseRow) {
          throw new ActionError({ code: 'BAD_REQUEST', message: 'Case not found' })
        }

        const user = context.locals.user
        const staff = isCaseStaff(user)
        const canPost = canParticipateInCase(user, caseRow) && (staff || isCasePublished(caseRow.status))
        if (!canPost) {
          throw new ActionError({ code: 'FORBIDDEN', message: 'You cannot post in this case.' })
        }

        // Only staff curate the public tier; participants always post at the
        // participant tier regardless of what the form submits.
        const visibility = staff ? input.visibility : CaseVisibility.PARTICIPANTS

        const update = await prisma.caseUpdate.create({
          data: {
            bodyMd: input.bodyMd,
            visibility,
            case: { connect: { id: input.caseId } },
            author: { connect: { id: user.id } },
          },
          select: { id: true },
        })

        return { update }
      },
    }),

    edit: defineProtectedAction({
      accept: 'form',
      permissions: manageCases,
      input: z.object({
        updateId: z.coerce.number().int().positive(),
        bodyMd: z.string().min(1),
        visibility: z.nativeEnum(CaseVisibility).default(CaseVisibility.PARTICIPANTS),
      }),
      handler: async (input) => {
        const existing = await prisma.caseUpdate.findUnique({
          where: { id: input.updateId },
          select: { id: true },
        })
        if (!existing) {
          throw new ActionError({ code: 'BAD_REQUEST', message: 'Update not found' })
        }

        const update = await prisma.caseUpdate.update({
          where: { id: input.updateId },
          data: { bodyMd: input.bodyMd, visibility: input.visibility },
          select: { id: true },
        })

        return { update }
      },
    }),

    delete: defineProtectedAction({
      accept: 'form',
      permissions: manageCases,
      input: z.object({ updateId: z.coerce.number().int().positive() }),
      handler: async (input) => {
        const evidence = await prisma.caseEvidence.findMany({
          where: { caseUpdateId: input.updateId },
          select: { imageUrl: true },
        })
        await prisma.caseUpdate.delete({ where: { id: input.updateId } })

        for (const item of evidence) {
          if (item.imageUrl) {
            try {
              await deleteFileLocally(item.imageUrl)
            } catch (error: unknown) {
              console.error('Failed to delete case evidence image:', error)
            }
          }
        }
      },
    }),
  },

  evidence: {
    add: defineProtectedAction({
      accept: 'form',
      permissions: manageCases,
      input: z.object({
        caseId: z.coerce.number().int().positive(),
        caseUpdateId: optionalPositiveInt,
        type: z.nativeEnum(CaseEvidenceType),
        description: optionalText,
        bodyMd: optionalText,
        imageFile: imageFileSchema,
        watermark: z.coerce.boolean().default(false),
        visibility: z.nativeEnum(CaseVisibility).default(CaseVisibility.PARTICIPANTS),
      }),
      handler: async (input) => {
        const existing = await prisma.case.findUnique({ where: { id: input.caseId }, select: { id: true } })
        if (!existing) {
          throw new ActionError({ code: 'BAD_REQUEST', message: 'Case not found' })
        }

        if (input.caseUpdateId) {
          const update = await prisma.caseUpdate.findFirst({
            where: { id: input.caseUpdateId, caseId: input.caseId },
            select: { id: true },
          })
          if (!update) {
            throw new ActionError({ code: 'BAD_REQUEST', message: 'Update not found for this case' })
          }
        }

        const imageUrl = input.imageFile
          ? await saveFileLocally(input.imageFile, input.imageFile.name, `cases/${input.caseId.toString()}`, {
              watermark: input.watermark,
            })
          : null

        if (!input.bodyMd && !imageUrl) {
          throw new ActionError({ code: 'BAD_REQUEST', message: 'Add a note or an image for the evidence.' })
        }

        const order = await prisma.caseEvidence.count({
          where: { caseId: input.caseId, caseUpdateId: input.caseUpdateId ?? null },
        })

        const evidence = await prisma.caseEvidence.create({
          data: {
            caseId: input.caseId,
            caseUpdateId: input.caseUpdateId ?? null,
            type: input.type,
            description: input.description ?? null,
            bodyMd: input.bodyMd ?? null,
            imageUrl,
            visibility: input.visibility,
            order,
          },
          select: { id: true },
        })

        return { evidence }
      },
    }),

    delete: defineProtectedAction({
      accept: 'form',
      permissions: manageCases,
      input: z.object({ evidenceId: z.coerce.number().int().positive() }),
      handler: async (input) => {
        const evidence = await prisma.caseEvidence.findUnique({
          where: { id: input.evidenceId },
          select: { id: true, imageUrl: true },
        })
        if (!evidence) {
          throw new ActionError({ code: 'BAD_REQUEST', message: 'Evidence not found' })
        }

        if (evidence.imageUrl) {
          try {
            await deleteFileLocally(evidence.imageUrl)
          } catch (error: unknown) {
            console.error('Failed to delete case evidence image:', error)
          }
        }

        await prisma.caseEvidence.delete({ where: { id: input.evidenceId } })
      },
    }),
  },

  participants: {
    add: defineProtectedAction({
      accept: 'form',
      permissions: manageCases,
      input: z.object({
        caseId: z.coerce.number().int().positive(),
        userId: z.coerce.number().int().positive(),
      }),
      handler: async (input) => {
        const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } })
        if (!user) {
          throw new ActionError({ code: 'BAD_REQUEST', message: 'User not found' })
        }
        await prisma.case.update({
          where: { id: input.caseId },
          data: { participants: { connect: { id: input.userId } } },
          select: { id: true },
        })
      },
    }),

    remove: defineProtectedAction({
      accept: 'form',
      permissions: manageCases,
      input: z.object({
        caseId: z.coerce.number().int().positive(),
        userId: z.coerce.number().int().positive(),
      }),
      handler: async (input) => {
        await prisma.case.update({
          where: { id: input.caseId },
          data: { participants: { disconnect: { id: input.userId } } },
          select: { id: true },
        })
      },
    }),
  },
}
