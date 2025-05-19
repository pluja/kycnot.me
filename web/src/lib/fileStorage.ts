import { createHash } from 'crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { UPLOAD_DIR } from 'astro:env/server'

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

/**
 * Generate a hash from file content
 */
async function generateFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hash = createHash('sha1')
  hash.update(Buffer.from(buffer))
  return hash.digest('hex').substring(0, 10) // Use first 10 chars of hash
}

/**
 * Save a file locally and return its web-accessible URL path
 */
export async function saveFileLocally(
  file: File,
  originalFileName: string,
  subDir?: string
): Promise<string> {
  const fileBuffer = await file.arrayBuffer()
  const fileHash = await generateFileHash(file)

  const fileExtension = path.extname(originalFileName)
  const fileName = `${fileHash}${fileExtension}`

  // Use the provided subDir or default to 'services/pictures'
  const { fsPath: uploadDir, webPath: webUploadPath } = getUploadDir(subDir ?? 'services/pictures')

  await fs.mkdir(uploadDir, { recursive: true })
  const filePath = path.join(uploadDir, fileName)
  await fs.writeFile(filePath, Buffer.from(fileBuffer))
  const url = sanitizePath(`${webUploadPath}/${fileName}`)
  return url
}

function sanitizePath(inputPath: string): string {
  let sanitized = inputPath.replace(/\\+/g, '/')
  // Collapse multiple slashes, but preserve protocol (e.g., http://)
  sanitized = sanitized.replace(/([^:])\/+/g, '$1/')
  sanitized = sanitized.replace(/\/(\?|#|$)/g, '$1')
  return sanitized
}
