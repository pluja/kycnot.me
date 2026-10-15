import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'

import { ActionError } from 'astro:actions'
import sharp from 'sharp'

import { cleanupCommentEvidenceFiles, commentEvidenceFilePath } from './commentEvidenceCleanup'
import { saveFileLocally } from './fileStorage'
import { prisma } from './prisma'
import { Semaphore } from './semaphore'

async function saveCommentEvidenceImage(file: File) {
  const input = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 20_000_000 })
  const metadata = await input.metadata()
  if (!['png', 'jpeg', 'webp', 'heif'].includes(metadata.format) || (metadata.pages ?? 1) > 1) {
    throw new Error('Unsupported image format')
  }
  const buffer = await input
    .rotate()
    .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer()
  return saveFileLocally(
    new File([new Uint8Array(buffer)], 'evidence.webp', { type: 'image/webp' }),
    'evidence.webp',
    `comment-evidence/${randomUUID()}`
  )
}

export async function readCommentEvidenceImage(imagePath: string) {
  const filePath = commentEvidenceFilePath(imagePath)
  return filePath ? fs.readFile(filePath) : null
}

// evidenceImageSemaphore caps concurrent image decodes, each of which can hold tens of MB of native memory.
const evidenceImageSemaphore = new Semaphore(2, 20)

// withEvidenceImage saves the optional image, runs the database work, and
// queues the file for deletion when that work fails, so no orphan stays on disk.
export async function withEvidenceImage(
  imageFile: File | undefined,
  run: (imagePath: string | null) => Promise<void>
) {
  let imagePath: string | null = null
  if (imageFile) {
    const saving = evidenceImageSemaphore.run(() => saveCommentEvidenceImage(imageFile))
    if (!saving) {
      throw new ActionError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many images are being processed. Try again in a minute.',
      })
    }
    try {
      imagePath = await saving
    } catch {
      throw new ActionError({
        code: 'BAD_REQUEST',
        message: 'The image could not be saved. Use a PNG, JPEG, WebP or AVIF under 5 MB.',
      })
    }
  }
  try {
    await run(imagePath)
  } catch (error) {
    if (imagePath) {
      await prisma.evidenceFileCleanup.upsert({
        where: { path: imagePath },
        create: { path: imagePath },
        update: {},
      })
      await cleanupCommentEvidenceFiles()
    }
    throw error
  }
}
