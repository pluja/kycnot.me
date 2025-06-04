import { z } from 'astro/zod'
import { Client } from 'pg'

import { zodParseJSON } from './json'
import { makeNotificationContent, makeNotificationLink, makeNotificationTitle } from './notifications'
import { prisma } from './prisma'
import { getServerEnvVariable } from './serverEnvVariables'
import { sendPushNotification, type NotificationData } from './webPush'

import type { AstroIntegration, HookParameters } from 'astro'

const DATABASE_URL = getServerEnvVariable('DATABASE_URL')
const SITE_URL = getServerEnvVariable('SITE_URL')

let pgClient: Client | null = null

const INTEGRATION_NAME = 'postgres-listener'

async function handleNotificationCreated(
  notificationId: number,
  options: HookParameters<'astro:server:start'>
) {
  const logger = options.logger.fork(INTEGRATION_NAME)
  try {
    logger.info(`Processing notification with ID: ${String(notificationId)}`)

    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
      select: {
        id: true,
        type: true,
        userId: true,
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

    if (!notification) {
      logger.warn(`Notification with ID ${String(notificationId)} not found`)
      return
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

    if (subscriptions.length === 0) {
      logger.info(`No push subscriptions found for user ${notification.user.name}`)
      return
    }
    const notificationData = {
      title: makeNotificationTitle(notification, notification.user),
      body: makeNotificationContent(notification) ?? undefined,
      url: makeNotificationLink(notification, SITE_URL) ?? undefined,
    } satisfies NotificationData

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

    const successCount = results.filter((r) => r.status === 'fulfilled' && r.value).length
    const failureCount = results.filter((r) => !(r.status === 'fulfilled' && r.value)).length

    logger.info(
      `Push notification sent for notification ${String(notificationId)} to user ${notification.user.name}: ${String(successCount)} successful, ${String(failureCount)} failed`
    )
  } catch (error) {
    logger.error(`Error processing notification ${String(notificationId)}: ${getErrorMessage(error)}`)
  }
}

export function postgresListener(): AstroIntegration {
  return {
    name: 'postgres-listener',
    hooks: {
      'astro:server:start': async (options) => {
        const logger = options.logger.fork(INTEGRATION_NAME)

        try {
          logger.info('Starting PostgreSQL notification listener...')

          pgClient = new Client({ connectionString: DATABASE_URL })

          await pgClient.connect()
          logger.info('Connected to PostgreSQL for notifications')

          await pgClient.query('LISTEN notification_created')
          logger.info('Listening for notification_created events')

          pgClient.on('notification', (msg) => {
            if (msg.channel === 'notification_created') {
              const payload = zodParseJSON(z.object({ id: z.number().int().positive() }), msg.payload)
              if (!payload) {
                logger.warn(`Invalid notification ID in payload: ${String(msg.payload)}`)
                return
              }

              // NOTE: Don't await to avoid blocking
              void handleNotificationCreated(payload.id, options)
            }
          })

          pgClient.on('error', (error) => {
            logger.error(`PostgreSQL client error: ${getErrorMessage(error)}`)
          })

          pgClient.on('end', () => {
            logger.info('PostgreSQL client connection ended')
          })
        } catch (error) {
          logger.error(`Failed to start PostgreSQL listener: ${getErrorMessage(error)}`)
        }
      },

      'astro:server:done': async ({ logger: originalLogger }) => {
        const logger = originalLogger.fork(INTEGRATION_NAME)

        if (pgClient) {
          try {
            logger.info('Stopping PostgreSQL notification listener...')
            await pgClient.end()
            pgClient = null
            logger.info('PostgreSQL listener stopped')
          } catch (error) {
            logger.error(`Error stopping PostgreSQL listener: ${getErrorMessage(error)}`)
          }
        }
      },
    },
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}
