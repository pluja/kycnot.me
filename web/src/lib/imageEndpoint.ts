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

import type { APIContext, APIRoute } from 'astro'

const FILES_PREFIX = '/files/'

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
  const href = url.searchParams.get('href') ?? ''

  if (extractFilesSubpath(href) === null) {
    // Not one of our uploads, let Astro's default endpoint handle it.
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
      return await defaultImageEndpoint(context)
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
