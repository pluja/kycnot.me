import crypto from 'node:crypto'

import { ActionError } from 'astro:actions'

import { timeTrapSecretKey } from './timeTrapSecret'

export function validateCommentTimestamp(value: string) {
  try {
    const [ivHex, encryptedHex] = Buffer.from(value, 'base64').toString('utf8').split(':')
    if (!ivHex || !encryptedHex) throw new Error('Invalid token')
    const decipher = crypto.createDecipheriv('aes-256-cbc', timeTrapSecretKey, Buffer.from(ivHex, 'hex'))
    const timestamp = Number(decipher.update(encryptedHex, 'hex', 'utf8') + decipher.final('utf8'))
    const elapsed = Date.now() - timestamp
    if (!Number.isFinite(timestamp) || elapsed < 2000 || elapsed > 3_600_000) throw new Error('Expired token')
  } catch {
    throw new ActionError({
      code: 'BAD_REQUEST',
      message: 'This form expired or was sent too quickly. Reload and try again.',
    })
  }
}
