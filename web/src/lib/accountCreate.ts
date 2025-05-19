import { generateUsername } from 'unique-username-generator'

import { prisma } from './prisma'
import { generateUserSecretToken, hashUserSecretToken } from './userSecretToken'

/**
 * Generate a random username.
 * Format: `adjective_noun_1234`
 */
function generateRandomUsername() {
  return `${generateUsername('_')}_${Math.floor(Math.random() * 10000).toString()}`
}

export async function createAccount(preGeneratedToken?: string) {
  const token = preGeneratedToken ?? generateUserSecretToken()
  const hash = hashUserSecretToken(token)
  const username = generateRandomUsername()

  const user = await prisma.user.create({
    data: {
      name: username,
      secretTokenHash: hash,
      notificationPreferences: { create: {} },
    },
  })

  return { token, user }
}
