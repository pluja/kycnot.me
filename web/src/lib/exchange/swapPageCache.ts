import { LruByteCache } from '../lruByteCache'

const TTL_MS = 5 * 60_000
const MAX_TOTAL_BYTES = 48 * 1024 * 1024
const MAX_ENTRY_BYTES = 2 * 1024 * 1024

// Any other parameter (error=, success=, ...) changes the rendered page, so it must never share a cached copy.
const CACHEABLE_PARAMS = new Set(['from', 'to', 'sendAmount', 'receiveAmount', 'sortBy', 'approvedOnly'])

// Hop-by-hop and per-response headers that must not be replayed from a stored copy.
const UNSTORED_HEADERS = new Set(['set-cookie', 'content-length', 'transfer-encoding', 'connection'])

type CachedSwapPage = { body: Uint8Array<ArrayBuffer>; headers: [string, string][]; expiresAt: number }

const encoder = new TextEncoder()

const cache = new LruByteCache<CachedSwapPage>(MAX_TOTAL_BYTES, MAX_ENTRY_BYTES)

export function swapPageCacheKey(url: URL): string | null {
  if (url.pathname !== '/swap' && url.pathname !== '/swap/') return null
  const params = [...url.searchParams.entries()]
  const names = params.map(([name]) => name)
  if (names.some((name) => !CACHEABLE_PARAMS.has(name))) return null
  if (new Set(names).size !== names.length) return null
  for (const param of params) {
    if (param[0] === 'from' || param[0] === 'to') param[1] = param[1].toLowerCase()
  }
  params.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return new URLSearchParams(params).toString()
}

// isStorableSwapResponse needs no cookie check: Astro attaches cookies after the middleware chain, per request.
export function isStorableSwapResponse(response: Response): boolean {
  return (
    response.status === 200 &&
    (response.headers.get('Cache-Control') ?? '').startsWith('public') &&
    (response.headers.get('Content-Type') ?? '').startsWith('text/html')
  )
}

export function getCachedSwapPage(key: string, now = Date.now()): Response | null {
  const entry = cache.get(key)
  if (!entry || entry.expiresAt <= now) return null
  return new Response(entry.body, { status: 200, headers: entry.headers })
}

export function storeSwapPage(key: string, body: string, headers: Headers, now = Date.now()): void {
  const storedHeaders = [...headers.entries()].filter(([name]) => !UNSTORED_HEADERS.has(name.toLowerCase()))
  const bytes = encoder.encode(body)
  cache.set(key, { body: bytes, headers: storedHeaders, expiresAt: now + TTL_MS }, bytes.byteLength)
}
