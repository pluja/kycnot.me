import { randomUUID } from 'node:crypto'

import { deserializeActionResult } from 'astro:actions'
import { z } from 'astro:content'
import { REDIS_ACTIONS_SESSION_EXPIRY_SECONDS } from 'astro:env/server'

import { RedisGenericManager } from './redisGenericManager'

const dataSchema = z.object({
  actionName: z.string(),
  actionResult: z.union([
    z.object({
      type: z.literal('data'),
      contentType: z.literal('application/json+devalue'),
      status: z.literal(200),
      body: z.string(),
    }),
    z.object({
      type: z.literal('error'),
      contentType: z.literal('application/json'),
      status: z.number(),
      body: z.string(),
    }),
    z.object({
      type: z.literal('empty'),
      status: z.literal(204),
    }),
  ]),
})

class RedisActionsSessions extends RedisGenericManager {
  async store(data: z.input<typeof dataSchema>) {
    const sessionId = randomUUID()

    const parsedData = dataSchema.parse(data)
    await this.redisClient.set(`actions-session:${sessionId}`, JSON.stringify(parsedData), {
      EX: this.expirationTime,
    })

    return sessionId
  }

  async get(sessionId: string | null | undefined) {
    if (!sessionId) return null

    const key = `actions-session:${sessionId}`

    const rawData = await this.redisClient.get(key)
    if (!rawData) return null

    const data = dataSchema.parse(JSON.parse(rawData))
    const deserializedActionResult = deserializeActionResult(data.actionResult)

    return {
      deserializedActionResult,
      ...data,
    }
  }

  async delete(sessionId: string | null | undefined) {
    if (!sessionId) return

    await this.redisClient.del(`actions-session:${sessionId}`)
  }
}

export const redisActionsSessions = await RedisActionsSessions.createAndConnect({
  expirationTime: REDIS_ACTIONS_SESSION_EXPIRY_SECONDS,
})
