import { createClient } from 'redis'

import { getServerEnvVariable } from '../serverEnvVariables'

const REDIS_URL = getServerEnvVariable('REDIS_URL')

type RedisGenericManagerOptions = {
  expirationTime: number
}

export abstract class RedisGenericManager {
  protected redisClient
  /** The expiration time of the Redis session. In seconds. */
  readonly expirationTime: number

  /** @deprecated Use {@link createAndConnect} instead */
  constructor(options: RedisGenericManagerOptions) {
    this.redisClient = createClient({
      url: REDIS_URL,
    })

    this.expirationTime = options.expirationTime

    this.redisClient.on('error', (err) => {
      console.error(`[${this.constructor.name}] `, err)
    })
  }

  /** Closes the Redis connection */
  async close(): Promise<void> {
    await this.redisClient.quit()
  }

  /** Connects to the Redis connection */
  async connect(): Promise<void> {
    await this.redisClient.connect()
  }

  static async createAndConnect<T extends RedisGenericManager>(
    this: new (options: RedisGenericManagerOptions) => T,
    options: RedisGenericManagerOptions
  ): Promise<T> {
    const instance = new this(options)

    await instance.connect()
    return instance
  }
}
