import { listCurrencies as grpcListCurrencies } from './grpcClient'

import type { Currency } from '../../generated/aggregator/v1/aggregator'

const TTL_MS = 60 * 60 * 1000

// Cache successes only: on failure the next request retries immediately
// instead of serving staleness for an hour.
let cachedAt = 0
let cachedCurrencies: Currency[] | null = null

export async function getCachedCurrencies(): Promise<Currency[]> {
  if (cachedCurrencies !== null && Date.now() - cachedAt < TTL_MS) {
    return cachedCurrencies
  }
  const response = await grpcListCurrencies()
  // Cold-boot race or all providers failed. Treat as failure so callers
  // degrade gracefully rather than cache emptiness for a full TTL.
  if (response.currencies.length === 0) {
    throw new Error('Aggregator returned empty currency list')
  }
  cachedCurrencies = response.currencies
  cachedAt = Date.now()
  return cachedCurrencies
}

export function invalidateCurrenciesCache(): void {
  cachedAt = 0
  cachedCurrencies = null
}
