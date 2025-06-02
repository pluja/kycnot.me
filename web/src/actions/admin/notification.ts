import { z } from 'astro/zod'
import { sumBy } from 'lodash-es'

import { defineProtectedAction } from '../../lib/defineProtectedAction'
import { prisma } from '../../lib/prisma'
import { sendPushNotification } from '../../lib/webPush'
import { stringListOfSlugsSchemaRequired } from '../../lib/zodUtils'

export const adminNotificationActions = {
  webPush: {
    test: defineProtectedAction({
      accept: 'form',
      permissions: 'admin',
      input: z.object({
        userNames: stringListOfSlugsSchemaRequired,
        title: z.string().min(1).nullable(),
        body: z.string().nullable(),
        url: z.string().url().optional(),
      }),
      handler: async (input) => {
        const subscriptions = await prisma.pushSubscription.findMany({
          where: { user: { name: { in: input.userNames } } },
          select: {
            id: true,
            endpoint: true,
            p256dh: true,
            auth: true,
            userAgent: true,
            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        })

        const results = await Promise.allSettled(
          subscriptions.map(async (subscription) => {
            const result = await sendPushNotification(
              {
                endpoint: subscription.endpoint,
                keys: {
                  p256dh: subscription.p256dh,
                  auth: subscription.auth,
                },
              },
              {
                title: input.title ?? 'Test Notification',
                body: input.body ?? 'This is a test push notification from KYCNot.me',
                url: input.url ?? '/',
              }
            )

            // If subscription is invalid, remove it from database
            if (result.error && (result.error.statusCode === 410 || result.error.statusCode === 404)) {
              await prisma.pushSubscription.delete({
                where: { id: subscription.id },
              })
              console.info(`Removed invalid subscription for user ${subscription.user.name}`)
            }

            return result.success
          })
        )

        const successCount = sumBy(results, (r) => (r.status === 'fulfilled' && r.value ? 1 : 0))
        const failureCount = sumBy(results, (r) => (r.status === 'fulfilled' && r.value ? 0 : 1))
        const now = new Date()
        return {
          message: `Sent to ${successCount.toLocaleString()} devices, ${failureCount.toLocaleString()} failed. Sent at ${now.toLocaleString()}`,
          totalSubscriptions: subscriptions.length,
          successCount,
          failureCount,
          sentAt: now,
        }
      },
    }),
  },
}
