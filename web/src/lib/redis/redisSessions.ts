import { randomBytes } from 'crypto'

import { RedisGenericManager } from './redisGenericManager'

export class RedisSessions extends RedisGenericManager {
  /**
   * Generates a random session ID
   */
  private generateSessionId(): string {
    return randomBytes(32).toString('hex')
  }

  /**
   * Creates a new session for a user
   * @param userSecretTokenHash The ID of the user
   * @returns The generated session ID
   */
  async createSession(userSecretTokenHash: string): Promise<string> {
    const sessionId = this.generateSessionId()
    // Store the session with user ID
    await this.redisClient.set(`session:${sessionId}`, userSecretTokenHash, {
      EX: this.expirationTime,
    })

    // Store session ID in user's sessions set
    await this.redisClient.sAdd(`user:${userSecretTokenHash}:sessions`, sessionId)

    return sessionId
  }

  /**
   * Gets the user ID associated with a session
   * @param sessionId The session ID to look up
   * @returns The user ID or null if session not found
   */
  async getUserBySessionId(sessionId: string): Promise<string | null> {
    const userSecretTokenHash = await this.redisClient.get(`session:${sessionId}`)
    return userSecretTokenHash
  }

  /**
   * Deletes all sessions for a user
   * @param userSecretTokenHash The ID of the user whose sessions should be deleted
   */
  async deleteUserSessions(userSecretTokenHash: string): Promise<void> {
    // Get all session IDs for the user
    const sessionIds = await this.redisClient.sMembers(`user:${userSecretTokenHash}:sessions`)

    if (sessionIds.length > 0) {
      // Delete each session
      // Delete sessions one by one to avoid type issues with spread operator
      for (const sessionId of sessionIds) {
        await this.redisClient.del(`session:${sessionId}`)
      }

      // Delete the set of user's sessions
      await this.redisClient.del(`user:${userSecretTokenHash}:sessions`)
    }
  }

  /**
   * Deletes a specific session
   * @param sessionId The session ID to delete
   */
  async deleteSession(sessionId: string): Promise<void> {
    const userSecretTokenHash = await this.getUserBySessionId(sessionId)
    if (userSecretTokenHash) {
      await this.redisClient.del(`session:${sessionId}`)
      await this.redisClient.sRem(`user:${userSecretTokenHash}:sessions`, sessionId)
    }
  }
}

let redisSessions: RedisSessions | null = null

export async function getRedisSessions() {
  redisSessions ??= await RedisSessions.createAndConnect({
    expirationTime: 60 * 60 * 24, // 24 hours in seconds
  })
  return redisSessions
}
