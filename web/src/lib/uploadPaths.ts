import path from 'node:path'

import { UPLOAD_DIR } from 'astro:env/server'

const FILES_PREFIX = '/files/'

// extractFilesSubpath pulls the upload subpath out of either a bare `/files/x`
// path or a fully-qualified URL, returning null when the source is not an
// upload at all.
export function extractFilesSubpath(src: string): string | null {
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

export function resolveUploadPath(subpath: string): string | undefined {
  const uploadPath = path.isAbsolute(UPLOAD_DIR) ? UPLOAD_DIR : path.join(process.cwd(), UPLOAD_DIR)
  const fullPath = path.normalize(path.join(uploadPath, subpath))

  // path-traversal guard: resolved path must stay inside upload root
  if (!fullPath.startsWith(uploadPath + path.sep) && fullPath !== uploadPath) {
    return undefined
  }
  return fullPath
}
