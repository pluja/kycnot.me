import { Client } from 'pg'

import { getRedisServerEvents, type RedisServerEvents } from './redis/redisServerEvents'
import { sendNotification } from './sendNotifications'
import { getServerEnvVariable } from './serverEnvVariables'

import type { AstroIntegrationLogger } from 'astro'

const DATABASE_URL = getServerEnvVariable('DATABASE_URL')

let pgClient: Client | null = null

export async function startListener(
  logger: Pick<AstroIntegrationLogger, 'debug' | 'error' | 'info' | 'warn'>
) {
  try {
    logger.info('Starting PostgreSQL notification listener...')

    pgClient = new Client({ connectionString: DATABASE_URL })

    await pgClient.connect()
    logger.info('Connected to PostgreSQL for notifications')

    await pgClient.query('LISTEN notification_created')
    logger.info('Listening for notification_created events')

    const redisServerEvents = await getRedisServerEvents()

    pgClient.on('notification', (msg) => {
      if (msg.channel === 'notification_created') {
        const payload = parseJSON(msg.payload)
        if (
          !payload ||
          typeof payload !== 'object' ||
          !('id' in payload) ||
          typeof payload.id !== 'number' ||
          payload.id <= 0 ||
          !Number.isFinite(payload.id) ||
          !Number.isInteger(payload.id)
        ) {
          logger.warn(`Invalid notification ID in payload: ${String(msg.payload)}`)
          return
        }

        // NOTE: Don't await to avoid blocking
        void handleNotificationCreated(payload.id, logger, redisServerEvents)
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
}

async function handleNotificationCreated(
  notificationId: number,
  logger: Pick<AstroIntegrationLogger, 'debug' | 'error' | 'info' | 'warn'>,
  redisServerEvents: RedisServerEvents
) {
  try {
    logger.info(`Processing notification with ID: ${String(notificationId)}`)

    const results = await sendNotification(notificationId, logger, redisServerEvents)

    logger.info(
      `Sent push notifications for notification ${String(notificationId)} to ${String(results.success)} devices, ${String(results.failure)} failed`
    )
  } catch (error) {
    logger.error(`Error processing notification ${String(notificationId)}: ${getErrorMessage(error)}`)
  }
}

export async function stopListener(logger: AstroIntegrationLogger) {
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
}

function parseJSON<T = unknown, D extends T | undefined = undefined>(
  stringValue: string | null | undefined,
  defaultValue?: D
): D | T {
  if (!stringValue) return defaultValue as D

  try {
    return JSON.parse(stringValue) as T
  } catch (error) {
    console.error(error)
    return defaultValue as D
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}
