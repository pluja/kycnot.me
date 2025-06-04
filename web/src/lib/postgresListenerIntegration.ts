import { z } from 'astro/zod'
import { Client } from 'pg'

import { zodParseJSON } from './json'
import { sendNotification } from './sendNotifications'
import { getServerEnvVariable } from './serverEnvVariables'

import type { AstroIntegration, HookParameters } from 'astro'

const DATABASE_URL = getServerEnvVariable('DATABASE_URL')

let pgClient: Client | null = null

const INTEGRATION_NAME = 'postgres-listener'

async function handleNotificationCreated(
  notificationId: number,
  options: HookParameters<'astro:server:start'>
) {
  const logger = options.logger.fork(INTEGRATION_NAME)
  try {
    logger.info(`Processing notification with ID: ${String(notificationId)}`)

    const results = await sendNotification(notificationId, logger)

    logger.info(
      `Sent push notifications for notification ${String(notificationId)} to ${String(results.success)} devices, ${String(results.failure)} failed`
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
