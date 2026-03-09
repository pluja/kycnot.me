import fs from 'node:fs/promises'
import path from 'node:path'

import { UPLOAD_DIR } from 'astro:env/server'
import { lookup } from 'mime-types'

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

  const uploadPath = path.isAbsolute(UPLOAD_DIR) ? UPLOAD_DIR : path.join(process.cwd(), UPLOAD_DIR)
  const fullPath = path.normalize(path.join(uploadPath, filePath))

  // Prevent path traversal — resolved path must stay within the upload directory
  if (!fullPath.startsWith(uploadPath + path.sep) && fullPath !== uploadPath) {
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
