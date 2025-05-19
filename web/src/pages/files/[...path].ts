import fs from 'node:fs/promises'
import path from 'node:path'

import { UPLOAD_DIR } from 'astro:env/server'
import { lookup } from 'mime-types'

import type { APIRoute } from 'astro'

export const GET: APIRoute = async ({ params }) => {
  // Get the file path from the URL
  const filePath = params.path
  if (!filePath) {
    return new Response('File not found', { status: 404 })
  }

  // Get the base upload directory from environment variable
  const uploadPath = path.isAbsolute(UPLOAD_DIR) ? UPLOAD_DIR : path.join(process.cwd(), UPLOAD_DIR)

  // Full path to the requested file
  const fullPath = path.join(uploadPath, filePath)

  try {
    // Check if file exists
    await fs.access(fullPath)

    // Read file
    const file = await fs.readFile(fullPath)

    // Determine content type based on file extension using mime-types library
    const contentType = lookup(fullPath) || 'application/octet-stream'

    // Return the file with proper content type
    return new Response(file, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
      },
    })
  } catch (error) {
    console.error('Error serving file:', error)
    return new Response('File not found', { status: 404 })
  }
}
