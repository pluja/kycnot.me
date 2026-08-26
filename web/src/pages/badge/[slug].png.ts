import { badgeOgImageTemplates } from '../../components/OgImage'
import { createOgImageTextNormalizer, OG_IMAGE_LIMITS } from '../../lib/ogImageInput'
import {
  normalizeOgImageKycLevel,
  normalizeOgImageRating,
  normalizeOgImageScore,
} from '../../lib/ogImageNormalize'
import { badgeOgImagePropsSchemas } from '../../lib/ogImageProps'
import { ogRenderSemaphore } from '../../lib/ogImageRenderQueue'
import { prisma } from '../../lib/prisma'
import { isBadgeSize, isBadgeTheme, isEmbeddableBadgeStatus } from '../../lib/serviceBadges'

import type { BadgeSize, BadgeTheme } from '../../lib/serviceBadges'
import type { APIContext, APIRoute } from 'astro'

export const prerender = false

const BADGE_CACHE_SECONDS = 60 * 60
const BADGE_STALE_SECONDS = 24 * 60 * 60
const BADGE_CACHE_MAX_ENTRIES = 300
const BADGE_NOT_FOUND_CACHE_SECONDS = 5 * 60
const BADGE_CACHE_CONTROL = [
  'public',
  `max-age=${String(BADGE_CACHE_SECONDS)}`,
  `s-maxage=${String(BADGE_CACHE_SECONDS)}`,
  `stale-while-revalidate=${String(BADGE_STALE_SECONDS)}`,
].join(', ')
const BADGE_NOT_FOUND_CACHE_CONTROL = [
  'public',
  `max-age=${String(BADGE_NOT_FOUND_CACHE_SECONDS)}`,
  `s-maxage=${String(BADGE_NOT_FOUND_CACHE_SECONDS)}`,
].join(', ')

type CachedBadgeResponse = {
  body: Uint8Array
  expiresAt: number
  headers: [string, string][]
}

const badgeResponseCache = new Map<string, CachedBadgeResponse>()

// pendingBadgeRenders collapses concurrent requests for one badge onto a single
// render. The cache is only written after a render finishes, so without this a
// burst on one URL misses on every connection and each miss buys its own
// satori pass.
const pendingBadgeRenders = new Map<string, Promise<BadgeRenderOutcome>>()

type BadgeRenderOutcome =
  | { body: Uint8Array; headers: [string, string][]; status: 'ok' }
  | { status: 'busy' }
  | { status: 'notFound' }

function busyBadgeResponse() {
  return new Response('Badge service busy', {
    status: 429,
    headers: { 'Retry-After': '5', 'Cache-Control': 'no-store' },
  })
}

function notFoundBadgeResponse() {
  return new Response(null, {
    status: 404,
    headers: {
      'Cache-Control': BADGE_NOT_FOUND_CACHE_CONTROL,
    },
  })
}

function makeBadgeCacheKey({
  slug,
  size,
  theme,
  showScore,
  showRating,
  showKycLevel,
}: {
  slug: string
  size: BadgeSize
  theme: BadgeTheme
  showScore: boolean
  showRating: boolean
  showKycLevel: boolean
}) {
  const details = size === 'xs' ? 'compact' : [showScore, showRating, showKycLevel].map(Number).join('')
  return [slug, size, theme, details].join('|')
}

function getCachedBadgeResponse(cacheKey: string) {
  const cached = badgeResponseCache.get(cacheKey)
  if (!cached) return null

  if (cached.expiresAt <= Date.now()) {
    badgeResponseCache.delete(cacheKey)
    return null
  }

  return new Response(cached.body.slice(0), {
    status: 200,
    headers: cached.headers,
  })
}

async function readResponseBody(body: ReadableStream<Uint8Array> | null) {
  if (!body) return new Uint8Array()

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let totalLength = 0

  let chunk = await reader.read()
  while (!chunk.done) {
    chunks.push(chunk.value)
    totalLength += chunk.value.byteLength
    chunk = await reader.read()
  }

  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }

  return result
}

function cacheBadgeResponse(cacheKey: string, body: Uint8Array, headers: Headers): BadgeRenderOutcome {
  badgeResponseCache.set(cacheKey, {
    body,
    expiresAt: Date.now() + BADGE_CACHE_SECONDS * 1000,
    headers: [...headers.entries()],
  })

  if (badgeResponseCache.size > BADGE_CACHE_MAX_ENTRIES) {
    const oldestCacheKey = badgeResponseCache.keys().next().value
    if (oldestCacheKey) badgeResponseCache.delete(oldestCacheKey)
  }

  return { body, headers: [...headers.entries()], status: 'ok' }
}

export const GET: APIRoute = async (context) => {
  const { slug } = context.params
  if (!slug) return notFoundBadgeResponse()

  const sizeParam = context.url.searchParams.get('size') ?? 'sm'
  const size = isBadgeSize(sizeParam) ? sizeParam : 'sm'
  const themeParam = context.url.searchParams.get('theme') ?? 'dark'
  const theme = isBadgeTheme(themeParam) ? themeParam : 'dark'
  const showScore = context.url.searchParams.get('score') === '1'
  const showRating = context.url.searchParams.get('rating') === '1'
  const showKycLevel = context.url.searchParams.get('kyc') === '1'
  const cacheKey = makeBadgeCacheKey({ slug, size, theme, showScore, showRating, showKycLevel })

  const cachedResponse = getCachedBadgeResponse(cacheKey)
  if (cachedResponse) return cachedResponse

  const options = { showKycLevel, showRating, showScore, size, slug, theme }
  let pending = pendingBadgeRenders.get(cacheKey)
  if (!pending) {
    pending = renderBadge(cacheKey, options, context).finally(() => pendingBadgeRenders.delete(cacheKey))
    pendingBadgeRenders.set(cacheKey, pending)
  }

  try {
    const outcome = await pending
    if (outcome.status === 'notFound') return notFoundBadgeResponse()
    if (outcome.status === 'busy') return busyBadgeResponse()
    return new Response(outcome.body.slice(0), { status: 200, headers: outcome.headers })
  } catch (error) {
    console.error(`[badge] Failed to render badge-${size} for ${slug}:`, error)
    return new Response('Render failed', { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}

type BadgeRenderOptions = {
  showKycLevel: boolean
  showRating: boolean
  showScore: boolean
  size: BadgeSize
  slug: string
  theme: BadgeTheme
}

async function renderBadge(
  cacheKey: string,
  { showKycLevel, showRating, showScore, size, slug, theme }: BadgeRenderOptions,
  context: APIContext
): Promise<BadgeRenderOutcome> {
  const service = await prisma.service.findUnique({
    where: { slug, serviceVisibility: 'PUBLIC' },
    select: {
      name: true,
      overallScore: true,
      trustWeightedUserRating: true,
      verificationStatus: true,
      kycLevel: true,
    },
  })

  if (!service || !isEmbeddableBadgeStatus(service.verificationStatus)) return { status: 'notFound' }

  const baseProps = { verificationStatus: service.verificationStatus, theme }
  const metricProps = {
    overallScore: normalizeOgImageScore(service.overallScore),
    averageUserRating: normalizeOgImageRating(service.trustWeightedUserRating),
    kycLevel: normalizeOgImageKycLevel(service.kycLevel),
  }
  const normalizeBadgeText = createOgImageTextNormalizer(OG_IMAGE_LIMITS.badge.name)
  // Normalising can empty a name made only of emoji, and the schema requires a
  // non-empty one. This route has no default card to fall back to, so without
  // the slug such a service would serve 500 for its badge forever.
  const badgeName = normalizeBadgeText(service.name, OG_IMAGE_LIMITS.badge.name).trim() || slug

  // The template call is the CPU-heavy part, so only it takes a render slot.
  // The lookup above stays outside: holding a slot across database I/O would
  // shed requests the box has the capacity to serve.
  const pending = ogRenderSemaphore.run(async () => {
    switch (size) {
      case 'lg':
        return await badgeOgImageTemplates['badge-lg'](
          badgeOgImagePropsSchemas['badge-lg'].parse({
            ...baseProps,
            ...metricProps,
            name: badgeName,
            showScore,
            showRating,
            showKycLevel,
          }),
          context
        )
      case 'sm':
        return await badgeOgImageTemplates['badge-sm'](
          badgeOgImagePropsSchemas['badge-sm'].parse({
            ...baseProps,
            ...metricProps,
            showScore,
            showRating,
            showKycLevel,
          }),
          context
        )
      case 'xs':
        return await badgeOgImageTemplates['badge-xs'](
          badgeOgImagePropsSchemas['badge-xs'].parse(baseProps),
          context
        )
    }
  })
  if (!pending) return { status: 'busy' }

  const response = await pending
  if (!response?.ok) throw new Error(`badge-${size} template returned no usable response`)

  const headers = new Headers(response.headers)
  headers.set('Cache-Control', BADGE_CACHE_CONTROL)
  return cacheBadgeResponse(cacheKey, await readResponseBody(response.body), headers)
}
