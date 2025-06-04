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
