import { ogImageTemplates } from '../../components/OgImage'
import { prisma } from '../../lib/prisma'
import { isBadgeSize, isBadgeTheme, isEmbeddableBadgeStatus } from '../../lib/serviceBadges'

import type { BadgeSize, BadgeTheme } from '../../lib/serviceBadges'
import type { APIRoute } from 'astro'

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

async function cacheBadgeResponse(cacheKey: string, bodyStream: ReadableStream<Uint8Array> | null, headers: Headers) {
  const body = await readResponseBody(bodyStream)

  badgeResponseCache.set(cacheKey, {
    body,
    expiresAt: Date.now() + BADGE_CACHE_SECONDS * 1000,
    headers: [...headers.entries()],
  })

  if (badgeResponseCache.size > BADGE_CACHE_MAX_ENTRIES) {
    const oldestCacheKey = badgeResponseCache.keys().next().value
    if (oldestCacheKey) badgeResponseCache.delete(oldestCacheKey)
  }

  return new Response(body.slice(0), {
    status: 200,
    headers,
  })
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

  const service = await prisma.service.findUnique({
    where: { slug, serviceVisibility: 'PUBLIC' },
    select: {
      name: true,
      overallScore: true,
      averageUserRating: true,
      verificationStatus: true,
      kycLevel: true,
    },
  })

  if (!service) return notFoundBadgeResponse()
  if (!isEmbeddableBadgeStatus(service.verificationStatus)) {
    return notFoundBadgeResponse()
  }

  const templateKey = `badge-${size}` as const
  const baseProps = { verificationStatus: service.verificationStatus, theme }

  try {
    const response =
      size === 'lg'
        ? await ogImageTemplates['badge-lg'](
            {
              ...baseProps,
              name: service.name,
              overallScore: service.overallScore,
              averageUserRating: service.averageUserRating,
              kycLevel: service.kycLevel,
              showScore,
              showRating,
              showKycLevel,
            },
            context
          )
        : size === 'sm'
          ? await ogImageTemplates['badge-sm'](
              {
                ...baseProps,
                overallScore: service.overallScore,
                averageUserRating: service.averageUserRating,
                kycLevel: service.kycLevel,
                showScore,
                showRating,
                showKycLevel,
              },
              context
            )
          : await ogImageTemplates['badge-xs'](baseProps, context)

    if (response === null) {
      return new Response('Render failed', { status: 500 })
    }

    const headers = new Headers(response.headers)
    headers.set('Cache-Control', BADGE_CACHE_CONTROL)

    return await cacheBadgeResponse(cacheKey, response.body, headers)
  } catch (error) {
    console.error(`[badge] Failed to render ${templateKey} for ${slug}:`, error)
    return new Response('Render failed', { status: 500 })
  }
}
