import fs from 'node:fs/promises'
import path from 'node:path'

import { confineToRoot } from './confinePath'
import { prisma } from './prisma'
import { getServerEnvVariable } from './serverEnvVariables'

// This module also runs in server-init, which Node starts outside Astro, so it must not import astro: modules.

// commentEvidenceFilePath maps a stored proof image path to its file on disk, or null for anything else.
export function commentEvidenceFilePath(imagePath: string) {
  if (!/^\/files\/comment-evidence\/[a-f0-9-]{36}\/[a-f0-9]+\.webp$/.test(imagePath)) return null
  const uploadRoot = path.resolve(getServerEnvVariable('UPLOAD_DIR', './local_uploads'))
  return confineToRoot(uploadRoot, imagePath.slice('/files/'.length))
}

export async function cleanupCommentEvidenceFiles() {
  const pending = await prisma.evidenceFileCleanup.findMany({
    select: { path: true },
    take: 50,
    // Files that keep failing go last, so they can't hold back the rest.
    orderBy: [{ attempts: 'asc' }, { createdAt: 'asc' }],
  })
  for (const file of pending) {
    try {
      const filePath = commentEvidenceFilePath(file.path)
      if (!filePath) throw new Error('Invalid evidence path')
      const inUse = await prisma.commentEvidence.count({ where: { imagePath: file.path, removedAt: null } })
      if (!inUse) await fs.rm(filePath, { force: true })
      await prisma.evidenceFileCleanup.deleteMany({ where: { path: file.path } })
    } catch {
      await prisma.evidenceFileCleanup.updateMany({
        where: { path: file.path },
        data: { attempts: { increment: 1 } },
      })
    }
  }
}
