import { randomUUID } from 'node:crypto'

import { z } from 'astro:content'

import { RedisGenericManager } from './redisGenericManager'

const dataSchema = z.object({
  adminId: z.number(),
  targetId: z.number(),
})

export class RedisImpersonationSessions extends RedisGenericManager {
  private readonly prefix = 'impersonation_session:'

  async store(data: z.input<typeof dataSchema>) {
    const sessionId = randomUUID()

    const parsedData = dataSchema.parse(data)
    await this.redisClient.set(`${this.prefix}${sessionId}`, JSON.stringify(parsedData), {
      EX: this.expirationTime,
    })

    return sessionId
  }

  async get(sessionId: string | null | undefined) {
    if (!sessionId) return null

    const key = `${this.prefix}${sessionId}`

    const rawData = await this.redisClient.get(key)
    if (!rawData) return null

    return dataSchema.parse(JSON.parse(rawData))
  }

  async delete(sessionId: string | null | undefined) {
    if (!sessionId) return

    await this.redisClient.del(`${this.prefix}${sessionId}`)
  }
}

let redisImpersonationSessions: RedisImpersonationSessions | null = null

export async function getRedisImpersonationSessions() {
  redisImpersonationSessions ??= await RedisImpersonationSessions.createAndConnect({
    expirationTime: 60 * 60 * 24, // 24 hours in seconds
  })
  return redisImpersonationSessions
}
