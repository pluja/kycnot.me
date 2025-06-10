import { makeNotificationActions, makeNotificationContent, makeNotificationTitle } from './notifications'
import { prisma } from './prisma'
import { getServerEnvVariable } from './serverEnvVariables'
import { sendPushNotification } from './webPush'

import type { RedisServerEvents } from './redis/redisServerEvents'
import type { NotificationPayload } from './serverEventsTypes'
import type { AstroIntegrationLogger } from 'astro'

const SITE_URL = getServerEnvVariable('SITE_URL')

export async function sendNotification(
  notificationId: number,
  logger: Pick<AstroIntegrationLogger, 'debug' | 'error' | 'info' | 'warn'>,
  redisServerEvents: RedisServerEvents
) {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
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
          type: true,
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

  if (!notification) {
    logger.error(`Notification with ID ${notificationId.toString()} not found`)
    return { success: 0, failure: 0, total: 0 }
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: notification.userId },
    select: {
      id: true,
      endpoint: true,
      p256dh: true,
      auth: true,
    },
  })

  const notificationPayload = {
    title: makeNotificationTitle(notification, notification.user),
    body: makeNotificationContent(notification),
    actions: makeNotificationActions(notification, SITE_URL),
  } satisfies NotificationPayload

  await redisServerEvents.send(notification.userId, 'new-notification', notificationPayload)

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
        notificationPayload
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
}
