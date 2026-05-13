import fs from 'node:fs/promises'
import path from 'node:path'

import { getConfiguredImageService, imageConfig } from 'astro:assets'
// Astro's stock Node endpoint is reused for everything that isn't a
// user-uploaded /files/* image (ESM-imported assets, the PWA fallbacks,
// etc.). The package exposes it at this path via the `./assets/endpoint/*`
// export map, so future Astro updates to the default handler flow through.
import { GET as defaultImageEndpoint } from 'astro/assets/endpoint/node'
import { UPLOAD_DIR } from 'astro:env/server'
import * as mime from 'mrmime'

import type { APIRoute } from 'astro'

// Custom replacement for Astro's default `/_image` endpoint. Same contract
// (GET /_image?href=...&w=...&h=...&f=...), but reads `/files/*` uploads
// directly from `UPLOAD_DIR` on disk instead of HTTP-fetching the public
// URL. Avoids the public-network roundtrip that breaks under preprod
// basic-auth and adds latency / SSRF surface in prod. Non-/files/ hrefs
// fall through to Astro's stock handler.

const FILES_PREFIX = '/files/'

export const GET: APIRoute = async (context) => {
  const { request } = context
  const url = new URL(request.url)
  const href = url.searchParams.get('href') ?? ''

  if (extractFilesSubpath(href) === null) {
    // Not one of our uploads — let Astro's default endpoint handle it.
    return defaultImageEndpoint(context)
  }

  try {
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
      return defaultImageEndpoint(context)
    }

    const inputBuffer = await readUpload(filesSubpath)
    if (!inputBuffer) {
      return new Response('Not found', { status: 404 })
    }

    const { data, format } = await imageService.transform(inputBuffer, transform, imageConfig)

    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        'Content-Type': mime.lookup(format) ?? `image/${format}`,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (error) {
    console.error('[imageEndpoint] Could not process image request:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
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

async function readUpload(subpath: string): Promise<Buffer | undefined> {
  const uploadPath = path.isAbsolute(UPLOAD_DIR)
    ? UPLOAD_DIR
    : path.join(process.cwd(), UPLOAD_DIR)
  const fullPath = path.normalize(path.join(uploadPath, subpath))

  // path-traversal guard: resolved path must stay inside upload root
  if (!fullPath.startsWith(uploadPath + path.sep) && fullPath !== uploadPath) {
    return undefined
  }

  try {
    return await fs.readFile(fullPath)
  } catch {
    return undefined
  }
}
