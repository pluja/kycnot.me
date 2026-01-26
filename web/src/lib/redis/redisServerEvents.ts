import { allServerEventsData, type ServerEventsData, type ServerEventsEvent } from '../serverEventsTypes'

import { RedisGenericManager } from './redisGenericManager'

export class RedisServerEvents extends RedisGenericManager {
  private readonly prefix = 'server_events:'

  /**
   * Broadcast an event to a user's server events listener.
   *
   * @param eventName - The event name to broadcast.
   * @param userId - The user ID to broadcast to.
   * @param data - The event to broadcast.
   */
  async send<T extends keyof ServerEventsData>(
    userId: number,
    eventName: T,
    data: ServerEventsData[T]
  ): Promise<void> {
    const channel = `${this.prefix}${String(userId)}:${eventName}` as const
    await this.redisClient.publish(channel, JSON.stringify(data))
  }

  /**
   * Subscribe to server events for a user.
   *
   * @param eventName - The event name to subscribe to.
   * @param userId - The user ID to subscribe to.
   * @param callback - The callback to call when the event is received.
   * @returns A cleanup function to unsubscribe.
   */
  async addListener<T extends keyof ServerEventsData | 'all'>(
    eventName: T,
    userId: number,
    callback: (event: T extends 'all' ? ServerEventsEvent : Extract<ServerEventsEvent, { type: T }>) => void
  ): Promise<() => Promise<void>> {
    const subscriber = this.redisClient.duplicate()
    await subscriber.connect()

    const channel =
      eventName === 'all'
        ? allServerEventsData.map((eventName) => `${this.prefix}${String(userId)}:${eventName}` as const)
        : (`${this.prefix}${String(userId)}:${eventName}` as const)

    await subscriber.subscribe(channel, (message, channelKey) => {
      try {
        const data = JSON.parse(message) as ServerEventsData[T extends 'all' ? keyof ServerEventsData : T]
        const prefixSegments = this.prefix.split(':').length
        const type = channelKey.split(':')[prefixSegments] as T extends 'all' ? keyof ServerEventsData : T
        const event = { type, data } as T extends 'all'
          ? ServerEventsEvent
          : Extract<ServerEventsEvent, { type: T }>
        callback(event)
      } catch (error) {
        console.error('Failed to parse notification stream event:', error)
      }
    })

    return async () => {
      await subscriber.unsubscribe(channel)
      subscriber.destroy()
    }
  }
}

let redisServerEvents: RedisServerEvents | null = null

export async function getRedisServerEvents() {
  redisServerEvents ??= await RedisServerEvents.createAndConnect({
    expirationTime: 60 * 60 * 24, // 24 hours in seconds
  })
  return redisServerEvents
}
