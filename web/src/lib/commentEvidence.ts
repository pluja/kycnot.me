import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'

import { cleanupCommentEvidenceFiles, commentEvidenceFilePath } from './commentEvidenceCleanup'
import { saveImageUpload } from './fileStorage'
import { prisma } from './prisma'

export async function readCommentEvidenceImage(imagePath: string) {
  const filePath = commentEvidenceFilePath(imagePath)
  return filePath ? fs.readFile(filePath) : null
}

// withEvidenceImage saves the optional image, runs the database work, and
// queues the file for deletion when that work fails, so no orphan stays on disk.
export async function withEvidenceImage(
  imageFile: File | undefined,
  run: (imagePath: string | null) => Promise<void>
) {
  const imagePath = imageFile
    ? await saveImageUpload(imageFile, `comment-evidence/${randomUUID()}`, { maxDimension: 2000 })
    : null
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
