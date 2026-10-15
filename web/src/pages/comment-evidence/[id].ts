import { readCommentEvidenceImage } from '../../lib/commentEvidence'
import { canReadEvidence } from '../../lib/experiences'
import { prisma } from '../../lib/prisma'

import type { APIRoute } from 'astro'

export const GET: APIRoute = async ({ params, locals }) => {
  const id = Number(params.id)
  if (!Number.isSafeInteger(id) || id <= 0) return new Response('Not found', { status: 404 })
  const evidence = await prisma.commentEvidence.findUnique({
    where: { id },
    select: {
      authorId: true,
      removedAt: true,
      imagePath: true,
      comment: {
        select: { authorId: true, service: { select: { affiliatedUsers: { select: { userId: true } } } } },
      },
    },
  })
  const post = evidence?.comment && {
    authorId: evidence.comment.authorId,
    affiliatedUserIds: evidence.comment.service.affiliatedUsers.map((item) => item.userId),
  }
  if (!evidence?.imagePath || !canReadEvidence(locals.user, { ...evidence, post: post ?? undefined })) {
    return new Response('Not found', { status: 404 })
  }
  try {
    const buffer = await readCommentEvidenceImage(evidence.imagePath)
    if (!buffer) return new Response('Not found', { status: 404 })
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'",
      },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
