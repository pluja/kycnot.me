import { ogImageTemplates, type OgImageAllTemplatesWithProps } from '../components/OgImage'
import { LruByteCache } from '../lib/lruByteCache'
import { Semaphore } from '../lib/semaphore'

import type { APIContext, APIRoute } from 'astro'
import type { Misc } from 'ts-toolbelt'

// Preserves what @vercel/og set on the streamed response. The URL is
// content-addressed: every field that changes the picture is inside `?data=`,
// and upload filenames are content hashes, so a service turning into a scam
// produces a different URL rather than a stale hit.
const SUCCESS_CACHE_CONTROL = 'public, immutable, no-transform, max-age=31536000'

// satori + resvg are CPU-heavy and `?data=` is attacker-controlled, so renders
// queue behind a small cap and shed beyond a bounded backlog rather than
// saturating the box.
const renderSemaphore = new Semaphore(2, 50)

// Every social platform keeps its own unfurl cache, so the same card is
// rendered once per platform and again after each deploy. Keyed on the raw
// `data` param, which fully determines the image.
const renderCache = new LruByteCache<Uint8Array<ArrayBuffer>>(32 * 1024 * 1024, 1024 * 1024)

function toJSON<T extends Misc.JSON.Value>(data: string | null | undefined): T | undefined {
  if (!data) return undefined
  try {
    return JSON.parse(data) as T
  } catch (_error) {
    return undefined
  }
}

export const GET: APIRoute = async (context) => {
  const rawData = context.url.searchParams.get('data') ?? ''
  const { template, ...props } = toJSON<OgImageAllTemplatesWithProps>(rawData) ?? { template: 'default' }

  const cached = renderCache.get(rawData)
  if (cached) {
    return imageResponse(cached)
  }

  const templateName = template in ogImageTemplates ? template : 'default'
  const templateProps = templateName === template ? props : {}

  try {
    const pending = renderSemaphore.run(() => renderToBytes(templateName, templateProps, context))
    if (!pending) {
      return new Response('Image service busy', {
        status: 429,
        headers: { 'Retry-After': '5', 'Cache-Control': 'no-store' },
      })
    }

    const bytes = await pending
    renderCache.set(rawData, bytes, bytes.byteLength)
    return imageResponse(bytes)
  } catch (error) {
    // Buffering the render is what makes this reachable: the stream @vercel/og
    // returns sends its headers before satori runs, so a failure used to escape
    // as a 200 image/png with a truncated body.
    console.error(
      `[ogimage] Failed to render template "${templateName}":`,
      error instanceof Error ? error.message : error
    )
    return new Response('Could not render image', {
      status: 500,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
}

async function renderToBytes(
  templateName: keyof typeof ogImageTemplates,
  props: Record<string, unknown>,
  context: APIContext
): Promise<Uint8Array<ArrayBuffer>> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
  const response = await ogImageTemplates[templateName](props as any, context)
  if (!response) {
    throw new Error('template returned no response')
  }
  // Draining the stream here is what surfaces a satori failure as a throw.
  return new Uint8Array(await response.arrayBuffer())
}

function imageResponse(bytes: Uint8Array<ArrayBuffer>): Response {
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': SUCCESS_CACHE_CONTROL,
    },
  })
}
