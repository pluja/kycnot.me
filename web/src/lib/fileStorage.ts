import { createHash } from 'crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { ActionError } from 'astro:actions'
import { UPLOAD_DIR } from 'astro:env/server'

import { reencodeUploadedImage } from './imageUpload'
import { Semaphore } from './semaphore'
import { watermarkImage } from './watermark'

/**
 * Get the configured upload directory with a subdirectory
 */
function getUploadDir(subDir = ''): { fsPath: string; webPath: string } {
  // Get the base upload directory from environment variable
  let baseUploadDir = UPLOAD_DIR

  // Determine if the path is absolute or relative
  const isAbsolutePath = path.isAbsolute(baseUploadDir)

  // If it's a relative path, resolve it relative to the project root
  if (!isAbsolutePath) {
    baseUploadDir = path.join(process.cwd(), baseUploadDir)
  }

  // For the filesystem path, combine the base dir with the subdirectory
  const fsPath = path.join(baseUploadDir, subDir)

  // For dynamic uploads, use the endpoint URL
  let webPath = `/files${subDir ? `/${subDir}` : ''}`

  // Normalize paths to ensure proper formatting
  webPath = path.normalize(webPath).replace(/\\/g, '/')
  webPath = sanitizePath(webPath)

  return {
    fsPath: path.normalize(fsPath),
    webPath,
  }
}

function hashContent(buffer: Buffer): string {
  return createHash('sha1').update(buffer).digest('hex').substring(0, 10)
}

// uploadSemaphore caps concurrent image decodes, each of which can hold tens of MB of native memory.
const uploadSemaphore = new Semaphore(2, 20)

// PICTURE_SIZE bounds logos and avatars, which are shown small: a smaller stored file keeps every later resize cheap.
export const PICTURE_SIZE = { maxWidth: 1024, maxHeight: 1024 }

/**
 * Save an uploaded image and return its web-accessible URL path. When `watermark` is set, the image is
 * tiled with the KYCNOT.ME watermark; the filename is the hash of the final bytes.
 */
export async function saveImageUpload(
  file: File,
  subDir: string,
  {
    watermark = false,
    maxWidth = 4096,
    maxHeight,
  }: { watermark?: boolean; maxWidth?: number; maxHeight?: number } = {}
): Promise<string> {
  const processing = uploadSemaphore.run(async () => {
    const image = await reencodeUploadedImage(Buffer.from(await file.arrayBuffer()), maxWidth, maxHeight)
    return watermark ? watermarkImage(image) : image
  })
  if (!processing) {
    throw new ActionError({
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many images are being processed. Try again in a minute.',
    })
  }
  let buffer: Buffer
  try {
    buffer = await processing
  } catch (error) {
    console.warn('[fileStorage] Rejected image upload:', error instanceof Error ? error.message : error)
    throw new ActionError({
      code: 'BAD_REQUEST',
      message: 'The image could not be read. Use a PNG, JPEG or WebP image under 5 MB.',
    })
  }

  const fileName = `${hashContent(buffer)}.webp`
  const { fsPath: uploadDir, webPath: webUploadPath } = getUploadDir(subDir)

  await fs.mkdir(uploadDir, { recursive: true })
  await fs.writeFile(path.join(uploadDir, fileName), buffer)
  return sanitizePath(`${webUploadPath}/${fileName}`)
}

/**
 * List all files in a specific subdirectory of the upload directory.
 * Returns an array of web-accessible URLs.
 */
export async function listFiles(subDir: string): Promise<string[]> {
  const { fsPath: uploadDir, webPath: webUploadPath } = getUploadDir(subDir)
  try {
    const files = await fs.readdir(uploadDir)
    return files.map((file) => sanitizePath(`${webUploadPath}/${file}`))
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT') {
      return []
    }
    console.error(`Error listing files in ${uploadDir}:`, error)
    throw error
  }
}

export type ImageFileInfo = {
  url: string
  date: Date
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.avif', '.webp'])

/**
 * List image files in a subdirectory, sorted by modification date (newest first).
 * Filters out non-image files (e.g. .watermark).
 */
export async function listImageFiles(subDir: string): Promise<ImageFileInfo[]> {
  const { fsPath: uploadDir, webPath: webUploadPath } = getUploadDir(subDir)
  try {
    const entries = await fs.readdir(uploadDir)
    const imageEntries = entries.filter((file) => {
      const ext = path.extname(file).toLowerCase()
      return IMAGE_EXTENSIONS.has(ext)
    })

    const results = await Promise.all(
      imageEntries.map(async (file) => {
        const stat = await fs.stat(path.join(uploadDir, file))
        return {
          url: sanitizePath(`${webUploadPath}/${file}`),
          date: stat.mtime,
        }
      })
    )

    return results.sort((a, b) => b.date.getTime() - a.date.getTime())
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT') {
      return []
    }
    console.error(`Error listing image files in ${uploadDir}:`, error)
    throw error
  }
}

/**
 * Delete a file locally given its web-accessible URL path
 */
export async function deleteFileLocally(fileUrl: string): Promise<void> {
  // Extract the subpath and filename from the webPath
  // Example: /files/evidence/service-slug/image.jpg -> evidence/service-slug/image.jpg
  const basePath = '/files'
  if (!fileUrl.startsWith(basePath)) {
    throw new Error('Invalid file URL for deletion. Must start with /files')
  }

  const subPathAndFile = fileUrl.substring(basePath.length).replace(/^\/+/, '') // Remove leading /files/ and any extra leading slashes
  const { fsPath: uploadDirWithoutSubDir } = getUploadDir() // Get base upload directory
  const filePath = path.join(uploadDirWithoutSubDir, subPathAndFile)

  // Confine deletion to the upload directory: a fileUrl containing ../ would
  // otherwise resolve outside it and let a caller unlink arbitrary files.
  const resolvedBase = path.resolve(uploadDirWithoutSubDir)
  const resolvedTarget = path.resolve(filePath)
  if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(resolvedBase + path.sep)) {
    throw new Error('Refusing to delete a file outside the upload directory')
  }

  try {
    await fs.unlink(filePath)
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT') {
      console.warn(`File not found for deletion, but treating as success: ${filePath}`)
      return
    }
    console.error(`Error deleting file ${filePath}:`, error)
    throw error
  }
}

function sanitizePath(inputPath: string): string {
  let sanitized = inputPath.replace(/\\+/g, '/')
  // Collapse multiple slashes, but preserve protocol (e.g., http://)
  sanitized = sanitized.replace(/([^:])\/+/g, '$1/')
  sanitized = sanitized.replace(/\/(\?|#|$)/g, '$1')
  return sanitized
}
