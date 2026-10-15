import { status } from '@grpc/grpc-js'

import { listSupportedProviders } from './grpcClient'

const TTL_MS = 30 * 60 * 1000
// FAILURE_TTL_MS keeps a down swap service from costing every page view a failed call and a log line.
const FAILURE_TTL_MS = 60 * 1000

type CacheEntry = {
  expiresAt: number
  slugs: ReadonlySet<string>
}

let cache: CacheEntry | null = null
let inFlight: Promise<ReadonlySet<string>> | null = null

async function fetchAndCache(): Promise<ReadonlySet<string>> {
  try {
    const response = await listSupportedProviders()
    const slugs = new Set(response.serviceSlugs)
    cache = { expiresAt: Date.now() + TTL_MS, slugs }
    return slugs
  } catch (error) {
    if ((error as { code?: unknown }).code === status.UNAVAILABLE) {
      console.warn('Swap service unreachable, hiding swap links for a minute')
    } else {
      console.error('listSupportedProviders failed', error)
    }
    const slugs = new Set<string>()
    cache = { expiresAt: Date.now() + FAILURE_TTL_MS, slugs }
    return slugs
  } finally {
    inFlight = null
  }
}

/**
 * Returns the set of service slugs the aggregator can quote for. Cached for 30
 * minutes; concurrent callers share a single in-flight RPC. On error the
 * caller gets an empty set so we degrade to "no swap CTA" rather than a 500.
 */
export async function getSupportedProviderSlugs(): Promise<ReadonlySet<string>> {
  if (cache && Date.now() < cache.expiresAt) {
    return cache.slugs
  }
  inFlight ??= fetchAndCache()
  return inFlight
}
