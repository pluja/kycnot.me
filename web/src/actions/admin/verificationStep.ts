import { VerificationStepStatus } from '@prisma/client'
import { z } from 'astro/zod'
import { ActionError } from 'astro:actions'

import { defineProtectedAction } from '../../lib/defineProtectedAction'
import { cap } from '../../lib/permissions'
import { prisma } from '../../lib/prisma'
import { emptyToUndefined } from '../../lib/zodUtils'

// performedAt is stored as createdAt: tests are often written up days after they ran.
const performedAt = z.preprocess(
  emptyToUndefined,
  z.coerce
    .date()
    .refine((date) => date <= new Date(), 'The test date cannot be in the future')
    .optional()
)

const verificationStepSchemaBase = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z
    .string()
    .min(1, 'Description is required')
    .max(200, 'Description must be 200 characters or less'),
  status: z.nativeEnum(VerificationStepStatus),
  serviceId: z.coerce.number().int().positive(),
  evidenceMd: z.string().optional().nullable().default(null),
  showBanner: z.boolean().optional().default(false),
  performedAt,
})

const verificationStepUpdateSchema = z.object({
  id: z.coerce.number().int().positive(),
  title: z.string().min(1, 'Title is required').optional(),
  description: z
    .string()
    .min(1, 'Description is required')
    .max(200, 'Description must be 200 characters or less')
    .optional(),
  status: z.nativeEnum(VerificationStepStatus).optional(),
  evidenceMd: z.string().optional().nullable(),
  showBanner: z.boolean().optional().default(false),
  performedAt,
})

const verificationStepIdSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export const verificationStep = {
  create: defineProtectedAction({
    accept: 'form',
    permissions: cap('services:edit'),
    input: verificationStepSchemaBase,
    handler: async (input) => {
      const { serviceId, title, description, status, evidenceMd, showBanner, performedAt } = input

      const service = await prisma.service.findUnique({
        where: { id: serviceId },
      })

      if (!service) {
        throw new ActionError({
          code: 'NOT_FOUND',
          message: 'Service not found',
        })
      }

      const newVerificationStep = await prisma.verificationStep.create({
        data: {
          title,
          description,
          status,
          evidenceMd,
          showBanner,
          createdAt: performedAt,
          service: {
            connect: { id: serviceId },
          },
        },
      })

      return { verificationStep: newVerificationStep }
    },
  }),

  update: defineProtectedAction({
    accept: 'form',
    permissions: cap('services:edit'),
    input: verificationStepUpdateSchema,
    handler: async (input) => {
      const { id, performedAt, ...dataToUpdate } = input

      const existingStep = await prisma.verificationStep.findUnique({
        where: { id },
        select: { createdAt: true },
      })

      if (!existingStep) {
        throw new ActionError({
          code: 'NOT_FOUND',
          message: 'Verification step not found',
        })
      }

      // The form only holds a day: keep the stored time unless the day itself changed.
      const sameDay =
        performedAt?.toISOString().slice(0, 10) === existingStep.createdAt.toISOString().slice(0, 10)
      const updatedVerificationStep = await prisma.verificationStep.update({
        where: { id },
        data: { ...dataToUpdate, ...(sameDay ? {} : { createdAt: performedAt }) },
      })

      return { verificationStep: updatedVerificationStep }
    },
  }),

  delete: defineProtectedAction({
    accept: 'form',
    permissions: cap('services:edit'),
    input: verificationStepIdSchema,
    handler: async ({ id }) => {
      const existingStep = await prisma.verificationStep.findUnique({
        where: { id },
      })

      if (!existingStep) {
        throw new ActionError({
          code: 'NOT_FOUND',
          message: 'Verification step not found',
        })
      }

      await prisma.verificationStep.delete({ where: { id } })

      return { success: true, deletedId: id }
    },
  }),
}
