import { z } from 'astro/zod'

import { defineProtectedAction } from '../../lib/defineProtectedAction'
import { prisma } from '../../lib/prisma'
import { stringListOfSlugsSchemaRequired } from '../../lib/zodUtils'

export const adminNotificationActions = {
  test: defineProtectedAction({
    accept: 'form',
    permissions: 'admin',
    input: z.object({
      userNames: stringListOfSlugsSchemaRequired,
    }),
    handler: async (input) => {
      const users = await prisma.user.findMany({
        where: { name: { in: input.userNames } },
        select: { id: true },
      })

      const notifications = await prisma.notification.createManyAndReturn({
        data: users.map((user) => ({
          type: 'TEST',
          userId: user.id,
        })),
        select: { id: true },
      })

      return {
        message: `Created ${notifications.length.toString()} notifications.`,
      }
    },
  }),
}
