import { LruByteCache } from './lruByteCache'

export type RateLimitedLoggerOptions = {
  intervalMs?: number
  maxKeys?: number
  now?: () => number
  warn?: ((message: string) => void) | undefined
}

type RateLimitedLogState = {
  lastLogAt: number
  suppressed: number
}

// createRateLimitedLogger caps each key to one line per interval. Keys must come
// from a bounded set: retention is capped at maxKeys, but a caller that keys on
// attacker-controlled text still floods the log with one line per fresh key.
export function createRateLimitedLogger({
  intervalMs = 60_000,
  maxKeys = 256,
  now = Date.now,
  warn = (message) => {
    console.warn(message)
  },
}: RateLimitedLoggerOptions = {}) {
  const states = new LruByteCache<RateLimitedLogState>(maxKeys, 1)

  return (key: string, message: string): void => {
    const timestamp = now()
    const state = states.get(key)
    if (state && timestamp - state.lastLogAt < intervalMs) {
      state.suppressed++
      return
    }

    const requestLabel = state?.suppressed === 1 ? 'request' : 'requests'
    const suffix = state?.suppressed
      ? ` (${String(state.suppressed)} similar ${requestLabel} suppressed)`
      : ''
    warn(`${message}${suffix}`)
    states.set(key, { lastLogAt: timestamp, suppressed: 0 }, 1)
  }
}
