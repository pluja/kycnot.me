import { randomUUID } from 'node:crypto'

import { z } from 'astro:content'
import { REDIS_IMPERSONATION_SESSION_EXPIRY_SECONDS } from 'astro:env/server'

import { RedisGenericManager } from './redisGenericManager'

const dataSchema = z.object({
  adminId: z.number(),
  targetId: z.number(),
})

class RedisImpersonationSessions extends RedisGenericManager {
  async store(data: z.input<typeof dataSchema>) {
    const sessionId = randomUUID()

    const parsedData = dataSchema.parse(data)
    await this.redisClient.set(`impersonation-session:${sessionId}`, JSON.stringify(parsedData), {
      EX: this.expirationTime,
    })

    return sessionId
  }

  async get(sessionId: string | null | undefined) {
    if (!sessionId) return null

    const key = `impersonation-session:${sessionId}`

    const rawData = await this.redisClient.get(key)
    if (!rawData) return null

    return dataSchema.parse(JSON.parse(rawData))
  }

  async delete(sessionId: string | null | undefined) {
    if (!sessionId) return

    await this.redisClient.del(`impersonation-session:${sessionId}`)
  }
}

export const redisImpersonationSessions = await RedisImpersonationSessions.createAndConnect({
  expirationTime: REDIS_IMPERSONATION_SESSION_EXPIRY_SECONDS,
})
