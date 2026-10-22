import { type Prisma, type ServiceUserRole } from '@prisma/client'
import { z } from 'astro/zod'
import { ActionError } from 'astro:actions'

import { capabilitiesZodEnum } from '../../constants/capabilities'
import { recordAuditLog } from '../../lib/auditLog'
import { defineProtectedAction } from '../../lib/defineProtectedAction'
import { saveImageUpload } from '../../lib/fileStorage'
import { cap, withoutOrphanCapabilities } from '../../lib/permissions'
import { prisma } from '../../lib/prisma'
import { displayNameSchema, httpUrlSchema } from '../../lib/zodUtils'

const selectUserReturnFields = {
  id: true,
  name: true,
  displayName: true,
  link: true,
  picture: true,
  admin: true,
  verified: true,
  capabilities: true,
  canCreateApiKeys: true,
  verifiedLink: true,
  createdAt: true,
  updatedAt: true,
  spammer: true,
} as const satisfies Prisma.UserSelect

type AuditedUserFields = Prisma.UserGetPayload<{
  select: {
    name: true
    displayName: true
    link: true
    verifiedLink: true
    picture: true
    admin: true
    spammer: true
    capabilities: true
    canCreateApiKeys: true
  }
}>

function userUpdateAuditSummary(before: AuditedUserFields, after: AuditedUserFields) {
  const granted = after.capabilities.filter((capability) => !before.capabilities.includes(capability))
  const revoked = before.capabilities.filter((capability) => !after.capabilities.includes(capability))
  const profileFields = (['name', 'displayName', 'link', 'verifiedLink', 'picture'] as const).filter(
    (field) => before[field] !== after[field]
  )

  return [
    before.admin !== after.admin && (after.admin ? 'Made admin' : 'Removed admin'),
    before.spammer !== after.spammer && (after.spammer ? 'Marked as spammer' : 'Unmarked as spammer'),
    granted.length > 0 && `Granted ${granted.join(', ')}`,
    revoked.length > 0 && `Revoked ${revoked.join(', ')}`,
    before.canCreateApiKeys !== after.canCreateApiKeys &&
      (after.canCreateApiKeys ? 'Allowed API keys' : 'Disallowed API keys'),
    profileFields.length > 0 && `Edited ${profileFields.join(', ')}`,
  ]
    .filter(Boolean)
    .join('; ')
}

// preventOwnAffiliationChange lets only admins change their own affiliations, which decide who may moderate a
// service.
function preventOwnAffiliationChange(actor: { id: number; admin: boolean }, targetUserId: number) {
  if (actor.id === targetUserId && !actor.admin) {
    throw new ActionError({ code: 'FORBIDDEN', message: 'Ask an admin to change your own affiliations.' })
  }
}

export const adminUserActions = {
  search: defineProtectedAction({
    accept: 'form',
    permissions: cap('users:manage'),
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
    permissions: cap('users:manage'),
    input: z.object({
      id: z.number().int().positive(),
      name: z.string().min(1, 'Name is required').max(255, 'Name must be less than 255 characters'),
      link: httpUrlSchema
        .nullable()
        .default(null) // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        .transform((val) => val || null),
      pictureFile: z.instanceof(File).optional(),
      type: z.array(z.enum(['admin', 'spammer'])).default([]),
      capabilities: z.array(capabilitiesZodEnum).default([]),
      canCreateApiKeys: z.coerce.boolean().default(false),
      verifiedLink: httpUrlSchema
        .nullable()
        .default(null) // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        .transform((val) => val || null),
      displayName: displayNameSchema
        .nullable()
        .default(null) // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        .transform((val) => val || null),
    }),
    handler: async (
      { id, pictureFile, type, capabilities, canCreateApiKeys, ...valuesToUpdate },
      context
    ) => {
      const user = await prisma.user.findUnique({
        where: {
          id,
        },
        select: {
          id: true,
          name: true,
          displayName: true,
          link: true,
          verifiedLink: true,
          picture: true,
          admin: true,
          spammer: true,
          capabilities: true,
          canCreateApiKeys: true,
        },
      })

      if (!user) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'User not found',
        })
      }

      const pictureUrl =
        pictureFile && pictureFile.size > 0 ? await saveImageUpload(pictureFile, 'users/pictures/') : null

      const updatedUser = await prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: user.id },
          data: {
            name: valuesToUpdate.name,
            link: valuesToUpdate.link,
            verifiedLink: valuesToUpdate.verifiedLink,
            displayName: valuesToUpdate.displayName,
            verified: !!valuesToUpdate.verifiedLink,
            ...(pictureUrl ? { picture: pictureUrl } : {}),
            // Role, capability and API-key grants are admin-only; a users:manage
            // editor (e.g. support) leaves them untouched.
            ...(context.locals.user.admin
              ? {
                  admin: type.includes('admin'),
                  spammer: type.includes('spammer'),
                  capabilities: withoutOrphanCapabilities(capabilities),
                  canCreateApiKeys,
                }
              : {}),
          },
          select: selectUserReturnFields,
        })

        const summary = userUpdateAuditSummary(user, updated)
        if (summary) {
          await recordAuditLog(tx, {
            actorId: context.locals.user.id,
            action: 'UPDATED',
            targetType: 'USER',
            targetId: user.id,
            summary,
          })
        }

        return updated
      })

      return {
        updatedUser,
      }
    },
  }),

  internalNotes: {
    add: defineProtectedAction({
      accept: 'form',
      permissions: cap('users:manage'),
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
      permissions: cap('users:manage'),
      input: z.object({
        noteId: z.coerce.number().int().positive(),
      }),
      handler: async (input, context) => {
        await prisma.$transaction(async (tx) => {
          const note = await tx.internalUserNote.delete({
            where: { id: input.noteId },
            select: { userId: true },
          })
          await recordAuditLog(tx, {
            actorId: context.locals.user.id,
            action: 'DELETED',
            targetType: 'USER',
            targetId: note.userId,
            summary: 'Deleted an internal note',
          })
        })
      },
    }),

    update: defineProtectedAction({
      accept: 'form',
      permissions: cap('users:manage'),
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
      permissions: cap('users:manage'),
      input: z.object({
        userId: z.coerce.number().int().positive(),
        serviceId: z.coerce.number().int().positive(),
        role: z.enum(['OWNER', 'ADMIN', 'MODERATOR', 'SUPPORT', 'TEAM_MEMBER']),
      }),
      handler: async (input, context) => {
        preventOwnAffiliationChange(context.locals.user, input.userId)
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
            serviceAffiliation = await prisma.$transaction(async (tx) => {
              const updated = await tx.serviceUser.update({
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
              await recordAuditLog(tx, {
                actorId: context.locals.user.id,
                action: 'UPDATED',
                targetType: 'USER',
                targetId: input.userId,
                summary: `Affiliation with ${service.name} changed to ${input.role.toLowerCase().replace('_', ' ')}`,
              })
              return updated
            })

            return { serviceAffiliation, serviceName: service.name, updated: true }
          } else {
            // Create new affiliation
            serviceAffiliation = await prisma.$transaction(async (tx) => {
              const created = await tx.serviceUser.create({
                data: {
                  userId: input.userId,
                  serviceId: input.serviceId,
                  role: input.role as ServiceUserRole,
                },
              })
              await recordAuditLog(tx, {
                actorId: context.locals.user.id,
                action: 'UPDATED',
                targetType: 'USER',
                targetId: input.userId,
                summary: `Affiliated with ${service.name} as ${input.role.toLowerCase().replace('_', ' ')}`,
              })
              return created
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
      permissions: cap('users:manage'),
      input: z.object({
        id: z.coerce.number().int().positive(),
      }),
      handler: async (input, context) => {
        await prisma.$transaction(async (tx) => {
          const existing = await tx.serviceUser.findUnique({
            where: { id: input.id },
            select: { userId: true },
          })
          if (!existing) throw new ActionError({ code: 'NOT_FOUND', message: 'Affiliation not found' })
          preventOwnAffiliationChange(context.locals.user, existing.userId)
          const deleted = await tx.serviceUser.delete({
            where: {
              id: input.id,
            },
            select: { userId: true, service: { select: { name: true } } },
          })
          await recordAuditLog(tx, {
            actorId: context.locals.user.id,
            action: 'UPDATED',
            targetType: 'USER',
            targetId: deleted.userId,
            summary: `Removed affiliation with ${deleted.service.name}`,
          })
        })
      },
    }),
  },
}
