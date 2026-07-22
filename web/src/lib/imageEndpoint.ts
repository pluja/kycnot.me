// Custom `/_image` endpoint (wired via `image.endpoint` in astro.config).
// Reads /files/* uploads from disk instead of HTTP-fetching the public URL,
// avoiding a basic-auth/CF roundtrip. Other paths fall through to Astro.
//
// https://docs.astro.build/en/reference/configuration-reference/#imageendpoint
// https://docs.astro.build/en/reference/image-service-reference/#custom-image-api-endpoint

import fs from 'node:fs/promises'
import path from 'node:path'

import { GET as nodeImageEndpoint } from 'astro/assets/endpoint/node'
import { getConfiguredImageService, imageConfig } from 'astro:assets'
import { UPLOAD_DIR } from 'astro:env/server'
import * as mime from 'mrmime'

import { validateImageParams } from './imageRequestValidation'
import { LruByteCache } from './lruByteCache'
import { Semaphore } from './semaphore'
import { isPublicUploadSubpath } from './uploadAccess'

import type { APIContext, APIRoute } from 'astro'

const FILES_PREFIX = '/files/'

// Transforms are CPU-heavy (sharp/libvips) and allocate native memory, so
// bursts must queue behind a small concurrency cap and shed beyond a
// bounded backlog rather than balloon RSS (2026-07-15 outage).
const transformSemaphore = new Semaphore(4, 100)

// Transformed uploads are immutable per (file, params); the byte-capped LRU
// turns the homepage's thumbnail set into cache hits instead of repeated
// sharp work per new visitor.
const transformCache = new LruByteCache<{ data: Uint8Array<ArrayBuffer>; format: string }>(
  32 * 1024 * 1024,
  1024 * 1024
)

// Non-upload images (content/asset images like blog covers) are handed back to
// Astro's built-in endpoint. The `node` build endpoint walks a built server
// layout that doesn't exist under `astro dev`, where it spins forever in its
// `resolveOutDir` loop, so in dev we serve them via the Vite-backed `dev`
// endpoint. The dev import is dynamic and gated on `import.meta.env.DEV` so its
// `vite` dependency is dead-code-eliminated from the production build.
async function defaultImageEndpoint(context: APIContext): Promise<Response> {
  if (import.meta.env.DEV) {
    const { GET } = await import('astro/assets/endpoint/dev')
    return GET(context) as Promise<Response>
  }
  return nodeImageEndpoint(context) as Promise<Response>
}

export const GET: APIRoute = async (context) => {
  const { request } = context
  const url = new URL(request.url)

  const paramError = validateImageParams(url.searchParams)
  if (paramError) {
    return new Response(paramError, { status: 400 })
  }

  const href = url.searchParams.get('href') ?? ''

  const requestedSubpath = extractFilesSubpath(href)
  if (requestedSubpath !== null && !isPublicUploadSubpath(requestedSubpath)) {
    // Private upload subtrees (case evidence) are never served here; they go
    // through the access-checked /case-media route.
    return new Response('Not found', { status: 404 })
  }

  try {
    if (requestedSubpath === null) {
      // Not one of our uploads, let Astro's default endpoint handle it. It
      // transforms too, so it shares the concurrency cap.
      return (await transformSemaphore.run(() => defaultImageEndpoint(context))) ?? busyResponse()
    }

    const imageService = await getConfiguredImageService()
    if (!('transform' in imageService)) {
      throw new Error('Configured image service is not a local service')
    }

    const transform = await imageService.parseURL(url, imageConfig)
    if (!transform?.src) {
      return new Response('Invalid request', { status: 400 })
    }

    const filesSubpath = extractFilesSubpath(transform.src)
    if (filesSubpath === null) {
      // parseURL may have rewritten src; fall back rather than 403.
      return (await transformSemaphore.run(() => defaultImageEndpoint(context))) ?? busyResponse()
    }

    const uploadPath = resolveUploadPath(filesSubpath)
    if (!uploadPath) {
      return new Response('Not found', { status: 404 })
    }

    let stat
    try {
      stat = await fs.stat(uploadPath)
    } catch {
      return new Response('Not found', { status: 404 })
    }

    // mtime+size in the key so a replaced file under the same name never
    // serves a stale transform.
    const cacheKey = [
      filesSubpath,
      stat.mtimeMs,
      stat.size,
      transform.width ?? '',
      transform.height ?? '',
      transform.format ?? '',
      transform.quality ?? '',
    ].join('|')

    const cached = transformCache.get(cacheKey)
    if (cached) {
      return imageResponse(cached.data, cached.format)
    }

    const inputBuffer = await fs.readFile(uploadPath)
    const pending = transformSemaphore.run(() =>
      imageService.transform(inputBuffer, transform, imageConfig)
    )
    if (!pending) {
      return busyResponse()
    }

    let result
    try {
      result = await pending
    } catch (error) {
      // A stored upload libvips can't decode (e.g. an .ico) is a bad asset, not
      // a server fault; 415 keeps it out of the 5xx count while staying logged.
      console.error('[imageEndpoint] Could not transform image:', error)
      return new Response('Unsupported image', { status: 415 })
    }

    const { data, format } = result
    const bytes = new Uint8Array(data)
    transformCache.set(cacheKey, { data: bytes, format }, bytes.byteLength)

    return imageResponse(bytes, format)
  } catch (error) {
    console.error('[imageEndpoint] Could not process image request:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}

function busyResponse(): Response {
  return new Response('Image service busy', {
    status: 429,
    headers: { 'Retry-After': '5' },
  })
}

function imageResponse(data: Uint8Array<ArrayBuffer>, format: string): Response {
  return new Response(data, {
    status: 200,
    headers: {
      'Content-Type': mime.lookup(format) ?? `image/${format}`,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}

function extractFilesSubpath(src: string): string | null {
  if (src.startsWith(FILES_PREFIX)) {
    return src.slice(FILES_PREFIX.length)
  }
  try {
    const parsed = new URL(src)
    if (parsed.pathname.startsWith(FILES_PREFIX)) {
      return parsed.pathname.slice(FILES_PREFIX.length)
    }
  } catch {
    // not a parseable URL, ignore
  }
  return null
}

function resolveUploadPath(subpath: string): string | undefined {
  const uploadPath = path.isAbsolute(UPLOAD_DIR)
    ? UPLOAD_DIR
    : path.join(process.cwd(), UPLOAD_DIR)
  const fullPath = path.normalize(path.join(uploadPath, subpath))

  // path-traversal guard: resolved path must stay inside upload root
  if (!fullPath.startsWith(uploadPath + path.sep) && fullPath !== uploadPath) {
    return undefined
  }
  return fullPath
}
