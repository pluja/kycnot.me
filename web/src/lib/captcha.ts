import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

import { createCanvas } from '@napi-rs/canvas'
import { VAPID_PRIVATE_KEY } from 'astro:env/server'

export const CAPTCHA_LENGTH = 6
const CAPTCHA_CHARS = 'ABCDEFGHIJKMNOPRSTUVWXYZ123456789' // Notice that ambiguous characters are removed
const CAPTCHA_TOKEN_MAX_AGE_MS = 10 * 60 * 1000
const CAPTCHA_TOKEN_ALGORITHM = 'aes-256-gcm'
const CAPTCHA_TOKEN_KEY = createHash('sha256').update(VAPID_PRIVATE_KEY).digest()

type CaptchaTokenPayload = {
  expiresAt: number
  solution: string
}

function normalizeCaptchaValue(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/0/g, 'O')
    .replace(/Q/g, 'O')
    .replace(/L/g, 'I')
}

function createCaptchaToken(payload: CaptchaTokenPayload): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(CAPTCHA_TOKEN_ALGORITHM, CAPTCHA_TOKEN_KEY, iv)

  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  return `${iv.toString('base64url')}.${authTag.toString('base64url')}.${encrypted.toString('base64url')}`
}

function parseCaptchaToken(token: string): CaptchaTokenPayload | null {
  const [ivBase64Url, authTagBase64Url, encryptedBase64Url] = token.split('.')
  if (!ivBase64Url || !authTagBase64Url || !encryptedBase64Url) return null

  try {
    const decipher = createDecipheriv(
      CAPTCHA_TOKEN_ALGORITHM,
      CAPTCHA_TOKEN_KEY,
      Buffer.from(ivBase64Url, 'base64url')
    )
    decipher.setAuthTag(Buffer.from(authTagBase64Url, 'base64url'))

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedBase64Url, 'base64url')),
      decipher.final(),
    ]).toString('utf8')

    const parsedPayload = JSON.parse(decrypted) as Partial<CaptchaTokenPayload>
    if (typeof parsedPayload.solution !== 'string' || typeof parsedPayload.expiresAt !== 'number') {
      return null
    }

    return {
      solution: normalizeCaptchaValue(parsedPayload.solution),
      expiresAt: parsedPayload.expiresAt,
    }
  } catch {
    return null
  }
}

/** Generate a captcha image as a data URI */
export function generateCaptchaImage(text: string) {
  const width = 144
  const height = 48
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')

  // Fill background with gradient
  const gradient = ctx.createLinearGradient(0, 0, width, height)
  gradient.addColorStop(0, '#1a202c')
  gradient.addColorStop(1, '#2d3748')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  // Add grid pattern background
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
  ctx.lineWidth = 1
  for (let i = 0; i < width; i += 10) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i, height)
    ctx.stroke()
  }
  for (let i = 0; i < height; i += 10) {
    ctx.beginPath()
    ctx.moveTo(0, i)
    ctx.lineTo(width, i)
    ctx.stroke()
  }

  // Add wavy lines
  for (let i = 0; i < 3; i++) {
    const r = Math.floor(Math.random() * 200 + 55).toString()
    const g = Math.floor(Math.random() * 200 + 55).toString()
    const b = Math.floor(Math.random() * 200 + 55).toString()
    ctx.strokeStyle = 'rgba(' + r + ', ' + g + ', ' + b + ', 0.5)'
    ctx.lineWidth = Math.random() * 3 + 1

    ctx.beginPath()
    const startY = Math.random() * height
    let curveX = 0
    let curveY = startY

    ctx.moveTo(curveX, curveY)

    while (curveX < width) {
      const nextX = curveX + Math.random() * 20 + 10
      const nextY = startY + Math.sin(curveX / 20) * (Math.random() * 15 + 5)
      ctx.quadraticCurveTo(curveX + (nextX - curveX) / 2, curveY + Math.random() * 20 - 10, nextX, nextY)
      curveX = nextX
      curveY = nextY
    }
    ctx.stroke()
  }

  // Add random dots
  for (let i = 0; i < 100; i++) {
    const r = Math.floor(Math.random() * 200 + 55).toString()
    const g = Math.floor(Math.random() * 200 + 55).toString()
    const b = Math.floor(Math.random() * 200 + 55).toString()
    const alpha = (Math.random() * 0.5 + 0.1).toString()
    ctx.fillStyle = 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')'

    ctx.beginPath()
    ctx.arc(Math.random() * width, Math.random() * height, Math.random() * 2 + 1, 0, Math.PI * 2)
    ctx.fill()
  }

  // Draw captcha text with shadow and more distortion
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
  ctx.shadowBlur = 3
  ctx.shadowOffsetX = 2
  ctx.shadowOffsetY = 2

  // Calculate text positioning
  const fontSize = Math.floor(height * 0.55)
  const padding = 15
  const charWidth = (width - padding * 2) / text.length

  // Draw each character with various effects
  for (let i = 0; i < text.length; i++) {
    const r = Math.floor(Math.random() * 100 + 155).toString()
    const g = Math.floor(Math.random() * 100 + 155).toString()
    const b = Math.floor(Math.random() * 100 + 155).toString()
    ctx.fillStyle = 'rgb(' + r + ', ' + g + ', ' + b + ')'

    // Vary font style for each character
    const fontStyle = Math.random() > 0.5 ? 'bold' : 'normal'
    const fontFamily = Math.random() > 0.5 ? 'monospace' : 'Arial'
    const fontSizeStr = fontSize.toString()
    ctx.font = fontStyle + ' ' + fontSizeStr + 'px ' + fontFamily

    // Position with variations
    const xPos = padding + i * charWidth + (Math.random() * 8 - 4)
    const yPos = height * 0.6 + (Math.random() * 12 - 6)
    const rotation = Math.random() * 0.6 - 0.3
    const scale = 0.8 + Math.random() * 0.4

    ctx.save()
    ctx.translate(xPos, yPos)
    ctx.rotate(rotation)
    ctx.scale(scale, scale)

    // Add slight perspective effect
    if (Math.random() > 0.7) {
      ctx.transform(1, 0, 0.1, 1, 0, 0)
    } else if (Math.random() > 0.5) {
      ctx.transform(1, 0, -0.1, 1, 0, 0)
    }

    ctx.fillText(text.charAt(i), 0, 0)
    ctx.restore()
  }

  // Add some noise on top
  for (let x = 0; x < width; x += 3) {
    for (let y = 0; y < height; y += 3) {
      if (Math.random() > 0.95) {
        const alpha = (Math.random() * 0.2 + 0.1).toString()
        ctx.fillStyle = 'rgba(255, 255, 255, ' + alpha + ')'
        ctx.fillRect(x, y, 2, 2)
      }
    }
  }

  return {
    src: canvas.toDataURL('image/png'),
    width,
    height,
    format: 'png',
  } as const satisfies ImageMetadata
}

/** Generate a new captcha with an encrypted verification token and image data URI */
export function generateCaptcha() {
  const solution = Array.from({ length: CAPTCHA_LENGTH }, () =>
    CAPTCHA_CHARS.charAt(Math.floor(Math.random() * CAPTCHA_CHARS.length))
  ).join('')

  return {
    token: createCaptchaToken({
      solution,
      expiresAt: Date.now() + CAPTCHA_TOKEN_MAX_AGE_MS,
    }),
    image: generateCaptchaImage(solution),
  }
}

/** Verify a captcha input against the expected encrypted token */
export function verifyCaptcha(value: string, token: string): boolean {
  const parsedToken = parseCaptchaToken(token)
  if (!parsedToken) return false

  if (parsedToken.expiresAt < Date.now()) return false

  return normalizeCaptchaValue(value) === parsedToken.solution
}
