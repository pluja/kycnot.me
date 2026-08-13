import fs from 'node:fs/promises'

import { lookup } from 'mime-types'

import { isPublicUploadSubpath } from '../../lib/uploadAccess'
import { resolveUploadPath } from '../../lib/uploadPaths'

import type { APIRoute } from 'astro'

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/avif',
  'image/webp',
  'image/gif',
  'image/svg+xml',
])

export const GET: APIRoute = async ({ params }) => {
  const filePath = params.path
  if (!filePath) {
    return new Response('File not found', { status: 404 })
  }

  // Only public upload subtrees are served here. Private subtrees (case
  // evidence) are access-controlled and served by /case-media.
  if (!isPublicUploadSubpath(filePath)) {
    return new Response('File not found', { status: 404 })
  }

  const fullPath = resolveUploadPath(filePath)
  if (!fullPath) {
    return new Response('File not found', { status: 404 })
  }

  const contentType = lookup(fullPath) || 'application/octet-stream'

  // Only serve image files
  if (!ALLOWED_MIME_TYPES.has(contentType)) {
    return new Response('File not found', { status: 404 })
  }

  try {
    await fs.access(fullPath)
    const file = await fs.readFile(fullPath)

    return new Response(file, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'",
      },
    })
  } catch {
    return new Response('File not found', { status: 404 })
  }
}
