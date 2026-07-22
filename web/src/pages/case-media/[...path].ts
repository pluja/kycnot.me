import fs from 'node:fs/promises'
import path from 'node:path'

import { UPLOAD_DIR } from 'astro:env/server'
import { lookup } from 'mime-types'

import { canViewCaseEvidence } from '../../lib/caseAccess'
import { prisma } from '../../lib/prisma'

import type { APIRoute } from 'astro'

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/avif',
  'image/webp',
  'image/gif',
  'image/svg+xml',
])

const notFound = () => new Response('Not found', { status: 404 })

// Serves case evidence images from the private `cases/` upload subtree, gated by
// the viewer's case visibility. The public /files and /_image routes refuse this
// subtree, so this is the only path to the bytes and it must re-check access.
export const GET: APIRoute = async ({ params, locals }) => {
  const rel = params.path
  if (!rel) return notFound()

  // The stored evidence imageUrl is the canonical key for the visibility check.
  const evidence = await prisma.caseEvidence.findFirst({
    where: { imageUrl: `/files/cases/${rel}` },
    select: {
      visibility: true,
      case: {
        select: {
          status: true,
          reportedById: true,
          participants: { select: { id: true } },
          service: { select: { affiliatedUsers: { select: { userId: true } } } },
        },
      },
    },
  })
  if (!evidence || !canViewCaseEvidence(locals.user, evidence)) return notFound()

  const uploadRoot = path.isAbsolute(UPLOAD_DIR) ? UPLOAD_DIR : path.join(process.cwd(), UPLOAD_DIR)
  const casesRoot = path.join(uploadRoot, 'cases')
  const fullPath = path.normalize(path.join(casesRoot, rel))
  if (!fullPath.startsWith(casesRoot + path.sep)) return notFound()

  const contentType = lookup(fullPath) || 'application/octet-stream'
  if (!ALLOWED_MIME_TYPES.has(contentType)) return notFound()

  try {
    const file = await fs.readFile(fullPath)
    return new Response(file, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // Private evidence must never land in a shared cache.
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'",
      },
    })
  } catch {
    return notFound()
  }
}
