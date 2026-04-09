import crypto from 'node:crypto'

const DIGEST = 'sha256'
const PREFIX = 'kycnot_'

export function generateApiKey(): string {
  return PREFIX + crypto.randomBytes(16).toString('hex')
}

export function hashApiKey(key: string): string {
  return crypto.createHash(DIGEST).update(key).digest('hex')
}

export function verifyApiKey(key: string, hash: string): boolean {
  const computed = hashApiKey(key)
  return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(hash, 'hex'))
}

export function getApiKeyPrefix(key: string): string {
  return key.slice(0, PREFIX.length + 4)
}
