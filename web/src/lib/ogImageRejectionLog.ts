import { createRateLimitedLogger, type RateLimitedLoggerOptions } from './rateLimitedLog'

export type OgImageRejectionOutcome = 'Rejected request' | 'Using default card'

export function createOgImageRejectionLogger(options: RateLimitedLoggerOptions = {}) {
  const log = createRateLimitedLogger(options)

  // reasonKey groups the rate limit. It must stay bounded even when reason
  // embeds detail derived from `?data=`, which is unauthenticated.
  return (outcome: OgImageRejectionOutcome, reason: string, reasonKey = reason): void => {
    log(`${outcome}\0${reasonKey}`, `[ogimage] ${outcome}: ${reason}`)
  }
}

export const logOgImageRejection = createOgImageRejectionLogger()
