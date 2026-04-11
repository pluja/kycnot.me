import { randomUUID } from 'node:crypto'

import { deserializeActionResult } from 'astro:actions'
import { z } from 'astro:content'

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

export class RedisActionsSessions extends RedisGenericManager {
  private readonly prefix = 'actions_session:'

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

    const data = dataSchema.parse(JSON.parse(rawData))
    const deserializedActionResult = deserializeActionResult(data.actionResult)

    return {
      deserializedActionResult,
      ...data,
    }
  }

  async delete(sessionId: string | null | undefined) {
    if (!sessionId) return

    await this.redisClient.del(`${this.prefix}${sessionId}`)
  }
}

let redisActionsSessions: RedisActionsSessions | null = null

export async function getRedisActionsSessions() {
  redisActionsSessions ??= await RedisActionsSessions.createAndConnect({
    expirationTime: 60 * 5, // 5 minutes in seconds
  })
  return redisActionsSessions
}
