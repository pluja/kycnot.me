import { createHash } from 'node:crypto'

import { OG_IMAGE_SIGNING_SECRET } from 'astro:env/server'

import { publicOgImageTemplates, renderPublicOgImageTemplate } from '../components/OgImage'
import { LruByteCache } from '../lib/lruByteCache'
import { memoizeAsync } from '../lib/memoizeAsync'
import { trackMissingAssets } from '../lib/missingAssets'
import { type OgImageProps, type OgImagePublicTemplateName } from '../lib/ogImageProps'
import { logOgImageRejection } from '../lib/ogImageRejectionLog'
import { type OgImageRender } from '../lib/ogImageRenderer'
import { ogRenderSemaphore } from '../lib/ogImageRenderQueue'
import { parsePublicOgImageRequest } from '../lib/ogImageRequest'
import { isValidOgImageSignature } from '../lib/ogImageSignature'

import type { APIContext, APIRoute } from 'astro'

// IMMUTABLE_CACHE_CONTROL is safe because every field that changes the picture
// is inside `?data=`, and local image names are content hashes.
const IMMUTABLE_CACHE_CONTROL = 'public, immutable, no-transform, max-age=31536000'

// DEGRADED_CACHE_CONTROL covers a card that rendered without an asset it wanted.
// The immutable TTL would freeze it in every social and browser cache for a
// year, so a service whose upload was unreadable for one minute would keep its
// logo-less card for good. Short rather than no-store so a permanently missing
// asset still costs one render per window instead of one per request.
const DEGRADED_CACHE_CONTROL = 'public, no-transform, max-age=300'

// renderCache exists because every social platform keeps its own unfurl cache,
// so the same card is otherwise rendered once per platform and again after each
// deploy.
const renderCache = new LruByteCache<Uint8Array<ArrayBuffer>>(32 * 1024 * 1024, 2 * 1024 * 1024)

// renderDefaultCard is memoized because the fallback runs after the semaphore
// has released its slot, so without it every request carrying props that make a
// template throw would buy an uncapped render. The card takes no props and no
// request state, which is why one render can answer them all.
const renderDefaultCard = memoizeAsync(() => toPngBytes(publicOgImageTemplates.default()))

// cacheKey hashes the query param so an attacker cannot pad the key itself,
// which the cache's byte budget does not account for.
function cacheKey(rawData: string): string {
  return createHash('sha1').update(rawData).digest('base64url')
}

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength > 0 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  )
}

export const GET: APIRoute = async (context) => {
  const rawData = context.url.searchParams.get('data')
  // Props decide what the card asserts, so they are only trusted with a
  // signature this server issued. Checked before parsing so an unsigned payload
  // never reaches JSON.parse. A bare /ogimage.png stays the plain default card.
  if (
    rawData !== null &&
    !isValidOgImageSignature(OG_IMAGE_SIGNING_SECRET, rawData, context.url.searchParams.get('sig'))
  ) {
    logOgImageRejection('Using default card', 'Missing or invalid signature')
    return await fallbackResponse()
  }

  const parsedRequest = parsePublicOgImageRequest(rawData)
  if (!parsedRequest.success) {
    const outcome = parsedRequest.response === 'reject' ? 'Rejected request' : 'Using default card'
    logOgImageRejection(outcome, parsedRequest.reason, parsedRequest.reasonKey)
    return parsedRequest.response === 'reject' ? invalidParametersResponse() : await fallbackResponse()
  }

  const key = cacheKey(rawData ?? '')
  const cached = renderCache.get(key)
  if (cached) {
    return imageResponse(cached, IMMUTABLE_CACHE_CONTROL)
  }

  const { templateName, props } = parsedRequest

  const pending = ogRenderSemaphore.run(() =>
    trackMissingAssets(() => renderToBytes(templateName, props, context))
  )
  if (!pending) {
    return new Response('Image service busy', {
      status: 429,
      headers: { 'Retry-After': '5', 'Cache-Control': 'no-store' },
    })
  }

  try {
    const { result: bytes, missingAssets } = await pending
    if (missingAssets) {
      console.warn(`[ogimage] Rendered "${templateName}" without every asset, holding it out of the cache`)
      return imageResponse(bytes, DEGRADED_CACHE_CONTROL)
    }
    renderCache.set(key, bytes, bytes.byteLength)
    return imageResponse(bytes, IMMUTABLE_CACHE_CONTROL)
  } catch (error) {
    // Props come from an unauthenticated query param, so a render that throws is
    // usually bad input rather than a server fault: answer with the default card
    // so unfurls still get a picture, and never cache the degraded result.
    console.error(
      `[ogimage] Failed to render template "${templateName}":`,
      error instanceof Error ? error.message : error
    )
    return await fallbackResponse()
  }
}

async function fallbackResponse(): Promise<Response> {
  try {
    return imageResponse(await renderDefaultCard(), 'no-store')
  } catch (error) {
    console.error('[ogimage] Default template failed:', error instanceof Error ? error.message : error)
    return new Response('Could not render image', {
      status: 500,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
}

async function renderToBytes(
  templateName: OgImagePublicTemplateName,
  props: OgImageProps<OgImagePublicTemplateName>,
  context: APIContext
): Promise<Uint8Array<ArrayBuffer>> {
  return await toPngBytes(renderPublicOgImageTemplate(templateName, props, context))
}

// toPngBytes validates the completed renderer response before it enters a cache.
async function toPngBytes(rendered: OgImageRender): Promise<Uint8Array<ArrayBuffer>> {
  const response = await rendered
  if (!response?.ok) {
    throw new Error('template returned no usable response')
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (!isPng(bytes)) {
    throw new Error('template produced a non-PNG body')
  }
  return bytes
}

function invalidParametersResponse(): Response {
  return new Response('Invalid image parameters', {
    status: 400,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function imageResponse(bytes: Uint8Array<ArrayBuffer>, cacheControl: string): Response {
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': cacheControl,
    },
  })
}
