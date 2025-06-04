import { sum } from 'lodash-es'

import { makeNotificationContent, makeNotificationLink, makeNotificationTitle } from './notifications'
import { prisma } from './prisma'
import { getServerEnvVariable } from './serverEnvVariables'
import { type NotificationData, sendPushNotification } from './webPush'

import type { AstroIntegrationLogger } from 'astro'

const SITE_URL = getServerEnvVariable('SITE_URL')

export async function sendNotifications(
  notificationIds: number[],
  logger: AstroIntegrationLogger | Console = console
) {
  const notifications = await prisma.notification.findMany({
    where: { id: { in: notificationIds } },
    select: {
      id: true,
      type: true,
      userId: true,
      createdAt: true,
      aboutAccountStatusChange: true,
      aboutCommentStatusChange: true,
      aboutServiceVerificationStatusChange: true,
      aboutSuggestionStatusChange: true,
      aboutComment: {
        select: {
          id: true,
          author: { select: { id: true } },
          status: true,
          content: true,
          communityNote: true,
          parent: {
            select: {
              author: {
                select: {
                  id: true,
                },
              },
            },
          },
          service: {
            select: {
              slug: true,
              name: true,
            },
          },
        },
      },
      aboutServiceSuggestionId: true,
      aboutServiceSuggestion: {
        select: {
          status: true,
          service: {
            select: {
              name: true,
            },
          },
        },
      },
      aboutServiceSuggestionMessage: {
        select: {
          id: true,
          content: true,
          suggestion: {
            select: {
              id: true,
              service: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
      aboutEvent: {
        select: {
          title: true,
          type: true,
          service: {
            select: {
              slug: true,
              name: true,
            },
          },
        },
      },
      aboutService: {
        select: {
          slug: true,
          name: true,
          verificationStatus: true,
        },
      },
      aboutKarmaTransaction: {
        select: {
          points: true,
          action: true,
          description: true,
        },
      },
      user: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  })

  if (notifications.length < notificationIds.length) {
    const missingNotificationIds = notificationIds.filter(
      (id) => !notifications.some((notification) => notification.id === id)
    )
    logger.error(`Notifications with IDs ${missingNotificationIds.join(', ')} not found`)
  }

  const results = await Promise.allSettled(
    notifications.map(async (notification) => {
      const subscriptions = await prisma.pushSubscription.findMany({
        where: { userId: notification.userId },
        select: {
          id: true,
          endpoint: true,
          p256dh: true,
          auth: true,
        },
      })

      if (subscriptions.length === 0) {
        logger.info(`No push subscriptions found for user ${notification.user.name}`)
        return
      }
      const notificationData = {
        title: makeNotificationTitle(notification, notification.user),
        body: makeNotificationContent(notification) ?? undefined,
        url: makeNotificationLink(notification, SITE_URL) ?? undefined,
      } satisfies NotificationData

      const subscriptionResults = await Promise.allSettled(
        subscriptions.map(async (subscription) => {
          const result = await sendPushNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth,
              },
            },
            notificationData
          )

          // Remove invalid subscriptions
          if (result.error && (result.error.statusCode === 410 || result.error.statusCode === 404)) {
            await prisma.pushSubscription.delete({ where: { id: subscription.id } })
            logger.info(`Removed invalid subscription for user ${notification.user.name}`)
          }

          return result.success
        })
      )

      return {
        success: subscriptionResults.filter((r) => r.status === 'fulfilled' && r.value).length,
        failure: subscriptionResults.filter((r) => !(r.status === 'fulfilled' && r.value)).length,
        total: subscriptionResults.length,
      }
    })
  )

  return {
    subscriptions: {
      success: sum(results.map((r) => (r.status === 'fulfilled' && r.value?.success) ?? 0)),
      failure: sum(results.map((r) => (r.status === 'fulfilled' && r.value?.failure) ?? 0)),
      total: sum(results.map((r) => (r.status === 'fulfilled' && r.value?.total) ?? 0)),
    },
    notifications: {
      success: results.filter((r) => r.status === 'fulfilled').length,
      failure: results.filter((r) => r.status !== 'fulfilled').length,
      total: results.length,
    },
  }
}
