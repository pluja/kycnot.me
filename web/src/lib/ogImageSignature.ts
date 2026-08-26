import { createHmac, timingSafeEqual } from 'node:crypto'

export function signOgImageData(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url')
}

// isValidOgImageSignature gates `?data=` on a signature this server issued.
// The props drive what a card asserts, so without it any URL can render a
// KYCnot.me-branded verdict about any service.
export function isValidOgImageSignature(secret: string, data: string, signature: string | null): boolean {
  if (!signature) return false

  const expected = Buffer.from(signOgImageData(secret, data), 'utf8')
  const provided = Buffer.from(signature, 'utf8')
  // timingSafeEqual throws on a length mismatch, and the digest is fixed width,
  // so comparing lengths first leaks nothing.
  return expected.byteLength === provided.byteLength && timingSafeEqual(expected, provided)
}
