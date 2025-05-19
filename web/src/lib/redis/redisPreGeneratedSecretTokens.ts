import { REDIS_PREGENERATED_TOKEN_EXPIRY_SECONDS } from 'astro:env/server'

import { RedisGenericManager } from './redisGenericManager'

class RedisPreGeneratedSecretTokens extends RedisGenericManager {
  /**
   * Stores a pre-generated token with expiration
   * @param token The pre-generated token
   */
  async storePreGeneratedToken(token: string): Promise<void> {
    await this.redisClient.set(`pregenerated-user-secret-token:${token}`, '1', {
      EX: this.expirationTime,
    })
  }

  /**
   * Validates and consumes a pre-generated token
   * @param token The token to validate
   * @returns true if token was valid and consumed, false otherwise
   */
  async validateAndConsumePreGeneratedToken(token: string): Promise<boolean> {
    const key = `pregenerated-user-secret-token:${token}`
    const exists = await this.redisClient.exists(key)
    if (exists) {
      await this.redisClient.del(key)
      return true
    }
    return false
  }
}

export const redisPreGeneratedSecretTokens = await RedisPreGeneratedSecretTokens.createAndConnect({
  expirationTime: REDIS_PREGENERATED_TOKEN_EXPIRY_SECONDS,
})
