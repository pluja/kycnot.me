import { listSupportedProviders } from './grpcClient'

const TTL_MS = 30 * 60 * 1000

type CacheEntry = {
  fetchedAt: number
  slugs: ReadonlySet<string>
}

let cache: CacheEntry | null = null
let inFlight: Promise<ReadonlySet<string>> | null = null

async function fetchAndCache(): Promise<ReadonlySet<string>> {
  try {
    const response = await listSupportedProviders()
    const slugs = new Set(response.serviceSlugs)
    cache = { fetchedAt: Date.now(), slugs }
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
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) {
    return cache.slugs
  }
  inFlight ??= fetchAndCache().catch((error) => {
    console.error('listSupportedProviders failed', error)
    return new Set<string>()
  })
  return inFlight
}
