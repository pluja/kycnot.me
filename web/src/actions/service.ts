import { z } from 'astro/zod'
import { ActionError } from 'astro:actions'

import { defineProtectedAction } from '../lib/defineProtectedAction'
import { prisma } from '../lib/prisma'

export const serviceActions = {
  requestVerification: defineProtectedAction({
    accept: 'form',
    permissions: 'user',
    input: z.object({
      serviceId: z.coerce.number().int().positive(),
      action: z.enum(['request', 'withdraw']),
    }),
    handler: async (input, context) => {
      const service = await prisma.service.findUnique({
        where: {
          id: input.serviceId,
        },
        select: {
          verificationStatus: true,
        },
      })

      if (!service) {
        throw new ActionError({
          message: 'Service not found',
          code: 'NOT_FOUND',
        })
      }

      if (
        service.verificationStatus === 'VERIFICATION_SUCCESS' ||
        service.verificationStatus === 'VERIFICATION_FAILED'
      ) {
        throw new ActionError({
          message: 'Service is already verified or marked as scam',
          code: 'BAD_REQUEST',
        })
      }

      const existingRequest = await prisma.serviceVerificationRequest.findUnique({
        where: {
          serviceId_userId: {
            serviceId: input.serviceId,
            userId: context.locals.user.id,
          },
        },
        select: {
          id: true,
        },
      })

      switch (input.action) {
        case 'withdraw': {
          if (!existingRequest) {
            throw new ActionError({
              message: 'You have not requested verification for this service',
              code: 'BAD_REQUEST',
            })
          }
          await prisma.serviceVerificationRequest.delete({
            where: {
              id: existingRequest.id,
            },
          })
          break
        }
        default:
        case 'request': {
          if (existingRequest) {
            throw new ActionError({
              message: 'You have already requested verification for this service',
              code: 'BAD_REQUEST',
            })
          }

          await prisma.serviceVerificationRequest.create({
            data: {
              serviceId: input.serviceId,
              userId: context.locals.user.id,
            },
          })

          await prisma.notificationPreferences.upsert({
            where: { userId: context.locals.user.id },
            update: {
              onVerificationChangeForServices: {
                connect: { id: input.serviceId },
              },
            },
            create: {
              userId: context.locals.user.id,
              onVerificationChangeForServices: {
                connect: { id: input.serviceId },
              },
            },
          })
          break
        }
      }
    },
  }),
}
