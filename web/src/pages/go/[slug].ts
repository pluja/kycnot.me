import { isAllowedHost, isValidCurrencyParam, normalizeHost } from '../../lib/goLink'
import { prisma } from '../../lib/prisma'
import { bumpWithTimeout } from '../../lib/stats'

import type { APIRoute } from 'astro'

export const prerender = false

const REDIRECT_HEADERS: HeadersInit = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
}

const errorResponse = (status: number): Response => new Response(null, { status })

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,63}[a-z0-9])?$/

// Skip the bump on non-document fetches (image/iframe/script embeds) so a
// third party can't inflate clickout counts via `<img src="/go/...">` on
// their own pages. Header is browser-set and forbidden to JavaScript;
// non-browser clients (curl, scripts) send no header and fall through.
const isCountableNavigation = (request: Request): boolean => {
  const dest = request.headers.get('sec-fetch-dest')
  return dest === null || dest === 'document'
}

export const GET: APIRoute = async ({ params, url, request }) => {
  const slug = params.slug ?? ''
  if (!SLUG_RE.test(slug)) return errorResponse(404)

  const service = await prisma.service.findUnique({
    where: { slug },
    select: { id: true, serviceUrls: true, referral: true },
  })
  if (!service || service.serviceUrls.length === 0) return errorResponse(404)

  const allowedHosts = service.serviceUrls
    .map(normalizeHost)
    .filter((host): host is string => host !== null)
  if (allowedHosts.length === 0) return errorResponse(404)

  const destination = url.searchParams.get('to')
  if (!destination) return errorResponse(400)

  const destHost = normalizeHost(destination)
  if (!destHost || !isAllowedHost(destHost, allowedHosts)) return errorResponse(400)

  const fromRaw = url.searchParams.get('from') ?? ''
  const toRaw = url.searchParams.get('to_ccy') ?? ''
  const validPair = fromRaw && toRaw && isValidCurrencyParam(fromRaw) && isValidCurrencyParam(toRaw)

  if (isCountableNavigation(request)) {
    await bumpWithTimeout({
      kind: 'swap.clickout',
      serviceId: service.id,
      fromCurrency: validPair ? fromRaw : undefined,
      toCurrency: validPair ? toRaw : undefined,
      refCode: service.referral ?? undefined,
    }).catch(() => null)
  }

  return new Response(null, {
    status: 302,
    headers: { ...REDIRECT_HEADERS, Location: destination },
  })
}
