import { type Prisma, type ServiceUserRole, type PrismaClient } from '@prisma/client'
import { ActionError } from 'astro:actions'
import { z } from 'zod'

import { defineProtectedAction } from '../../lib/defineProtectedAction'
import { saveFileLocally } from '../../lib/fileStorage'
import { prisma as prismaInstance } from '../../lib/prisma'

const prisma = prismaInstance as PrismaClient

const selectUserReturnFields = {
  id: true,
  name: true,
  displayName: true,
  link: true,
  picture: true,
  admin: true,
  verified: true,
  moderator: true,
  verifiedLink: true,
  secretTokenHash: true,
  totalKarma: true,
  createdAt: true,
  updatedAt: true,
  spammer: true,
} as const satisfies Prisma.UserSelect

export const adminUserActions = {
  search: defineProtectedAction({
    accept: 'form',
    permissions: 'admin',
    input: z.object({
      name: z.string().min(1, 'User name is required'),
    }),
    handler: async (input) => {
      const user = await prisma.user.findUnique({
        where: { name: input.name },
        select: selectUserReturnFields,
      })

      return { user }
    },
  }),

  update: defineProtectedAction({
    accept: 'form',
    permissions: 'admin',
    input: z.object({
      id: z.number().int().positive(),
      name: z.string().min(1, 'Name is required').max(255, 'Name must be less than 255 characters'),
      link: z
        .string()
        .url('Invalid URL')
        .nullable()
        .default(null) // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        .transform((val) => val || null),
      pictureFile: z.instanceof(File).optional(),
      type: z.array(z.enum(['admin', 'moderator', 'spammer'])),
      verifiedLink: z
        .string()
        .url('Invalid URL')
        .nullable()
        .default(null) // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        .transform((val) => val || null),
      displayName: z
        .string()
        .max(50, 'Display Name must be less than 50 characters')
        .nullable()
        .default(null) // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        .transform((val) => val || null),
    }),
    handler: async ({ id, pictureFile, type, ...valuesToUpdate }) => {
      const user = await prisma.user.findUnique({
        where: {
          id,
        },
        select: {
          id: true,
        },
      })

      if (!user) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'User not found',
        })
      }

      const pictureUrl =
        pictureFile && pictureFile.size > 0
          ? await saveFileLocally(pictureFile, pictureFile.name, 'users/pictures/')
          : null

      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          name: valuesToUpdate.name,
          link: valuesToUpdate.link,
          verifiedLink: valuesToUpdate.verifiedLink,
          displayName: valuesToUpdate.displayName,
          verified: !!valuesToUpdate.verifiedLink,
          picture: pictureUrl,
          admin: type.includes('admin'),
          moderator: type.includes('moderator'),
          spammer: type.includes('spammer'),
        },
        select: selectUserReturnFields,
      })

      return {
        updatedUser,
      }
    },
  }),

  internalNotes: {
    add: defineProtectedAction({
      accept: 'form',
      permissions: 'admin',
      input: z.object({
        userId: z.coerce.number().int().positive(),
        content: z.string().min(1).max(1000),
      }),
      handler: async (input, context) => {
        const note = await prisma.internalUserNote.create({
          data: {
            content: input.content,
            userId: input.userId,
            addedByUserId: context.locals.user.id,
          },
          select: {
            id: true,
          },
        })

        return { note }
      },
    }),

    delete: defineProtectedAction({
      accept: 'form',
      permissions: 'admin',
      input: z.object({
        noteId: z.coerce.number().int().positive(),
      }),
      handler: async (input) => {
        await prisma.internalUserNote.delete({
          where: {
            id: input.noteId,
          },
        })
      },
    }),

    update: defineProtectedAction({
      accept: 'form',
      permissions: 'admin',
      input: z.object({
        noteId: z.coerce.number().int().positive(),
        content: z.string().min(1).max(1000),
      }),
      handler: async (input, context) => {
        const note = await prisma.internalUserNote.update({
          where: {
            id: input.noteId,
          },
          data: {
            content: input.content,
            addedByUserId: context.locals.user.id,
          },
          select: {
            id: true,
          },
        })

        return { note }
      },
    }),
  },

  serviceAffiliations: {
    add: defineProtectedAction({
      accept: 'form',
      permissions: 'admin',
      input: z.object({
        userId: z.coerce.number().int().positive(),
        serviceId: z.coerce.number().int().positive(),
        role: z.enum(['OWNER', 'ADMIN', 'MODERATOR', 'SUPPORT', 'TEAM_MEMBER']),
      }),
      handler: async (input) => {
        // Check if the user exists
        const user = await prisma.user.findUnique({
          where: { id: input.userId },
          select: { id: true },
        })

        if (!user) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: 'User not found',
          })
        }

        // Check if the service exists
        const service = await prisma.service.findUnique({
          where: { id: input.serviceId },
          select: { id: true, name: true },
        })

        if (!service) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: 'Service not found',
          })
        }

        try {
          // Check if the service affiliation already exists
          const existingAffiliation = await prisma.serviceUser.findUnique({
            where: {
              userId_serviceId: {
                userId: input.userId,
                serviceId: input.serviceId,
              },
            },
          })

          let serviceAffiliation

          if (existingAffiliation) {
            // Update existing affiliation
            serviceAffiliation = await prisma.serviceUser.update({
              where: {
                userId_serviceId: {
                  userId: input.userId,
                  serviceId: input.serviceId,
                },
              },
              data: {
                role: input.role as ServiceUserRole,
              },
            })

            return { serviceAffiliation, serviceName: service.name, updated: true }
          } else {
            // Create new affiliation
            serviceAffiliation = await prisma.serviceUser.create({
              data: {
                userId: input.userId,
                serviceId: input.serviceId,
                role: input.role as ServiceUserRole,
              },
            })

            return { serviceAffiliation, serviceName: service.name }
          }
        } catch (error) {
          console.error('Error managing service affiliation:', error)
          throw new ActionError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Error managing service affiliation',
          })
        }
      },
    }),

    remove: defineProtectedAction({
      accept: 'form',
      permissions: 'admin',
      input: z.object({
        id: z.coerce.number().int().positive(),
      }),
      handler: async (input) => {
        const serviceAffiliation = await prisma.serviceUser.delete({
          where: {
            id: input.id,
          },
          include: {
            service: {
              select: {
                name: true,
              },
            },
          },
        })

        return { serviceAffiliation }
      },
    }),
  },

  karmaTransactions: {
    add: defineProtectedAction({
      accept: 'form',
      permissions: 'admin',
      input: z.object({
        userId: z.coerce.number().int().positive(),
        points: z.coerce.number().int(),
        description: z.string().min(1, 'Description is required'),
      }),
      handler: async (input, context) => {
        // Check if the user exists
        const user = await prisma.user.findUnique({
          where: { id: input.userId },
          select: { id: true },
        })

        if (!user) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: 'User not found',
          })
        }

        await prisma.karmaTransaction.create({
          data: {
            userId: input.userId,
            points: input.points,
            action: 'MANUAL_ADJUSTMENT',
            description: input.description,
            grantedByUserId: context.locals.user.id,
          },
        })
      },
    }),
  },
}
