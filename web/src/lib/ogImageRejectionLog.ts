export type OgImageRejectionOutcome = 'Rejected request' | 'Using default card'

type OgImageRejectionLoggerOptions = {
  intervalMs?: number
  now?: () => number
  warn?: (message: string) => void
}

type RejectionLogState = {
  lastLogAt: number
  suppressed: number
}

export function createOgImageRejectionLogger({
  intervalMs = 60_000,
  now = Date.now,
  warn = (message) => {
    console.warn(message)
  },
}: OgImageRejectionLoggerOptions = {}) {
  const states = new Map<string, RejectionLogState>()

  return (outcome: OgImageRejectionOutcome, reason: string): void => {
    const key = `${outcome}\0${reason}`
    const timestamp = now()
    const state = states.get(key)
    if (state && timestamp - state.lastLogAt < intervalMs) {
      state.suppressed++
      return
    }

    const suffix = state?.suppressed ? ` (${String(state.suppressed)} similar requests suppressed)` : ''
    warn(`[ogimage] ${outcome}: ${reason}${suffix}`)
    states.set(key, { lastLogAt: timestamp, suppressed: 0 })
  }
}

export const logOgImageRejection = createOgImageRejectionLogger()
