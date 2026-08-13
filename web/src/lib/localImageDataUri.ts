import fs from 'node:fs/promises'
import path from 'node:path'

import { lookup } from 'mime-types'
import sharp from 'sharp'

import { isPublicUploadSubpath } from './uploadAccess'
import { extractFilesSubpath, resolveUploadPath } from './uploadPaths'
import { siteOrigin } from './urls'

// SATORI_MIME_TYPES are the formats satori decodes natively; anything else has
// to be re-encoded before it can be embedded.
const SATORI_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/svg+xml'])

const BUILD_ASSET_PREFIX = '/_astro/'

type ConvertOptions = {
  width: number
  height: number
  fit: 'contain' | 'cover'
}

type ReadOptions = {
  // convert bounds images that have to be re-encoded for satori. Formats
  // satori reads natively are returned untouched.
  convert?: ConvertOptions
}

// readLocalImageAsDataUri resolves a same-origin image to a data URI by reading
// it off local disk, covering both `/files/*` uploads and `/_astro/*` build
// output. Rendering happens inside the server, so resolving these over the
// public URL would route the request back through the front end, which is not
// guaranteed to serve the app's own asset fetches.
export async function readLocalImageAsDataUri(
  src: string,
  { convert }: ReadOptions = {}
): Promise<string | null> {
  const buffer = await readLocalBytes(src)
  if (!buffer) {
    return null
  }

  try {
    const contentType = lookup(stripQuery(src)) || ''
    if (SATORI_MIME_TYPES.has(contentType) && !convert) {
      return `data:${contentType};base64,${buffer.toString('base64')}`
    }

    let image = sharp(buffer).png()
    if (convert) {
      image = image.resize(convert.width, convert.height, {
        fit: convert.fit,
        position: 'center',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
    }
    const converted = await image.toBuffer()
    return `data:image/png;base64,${converted.toString('base64')}`
  } catch {
    return null
  }
}

async function readLocalBytes(src: string): Promise<Buffer | null> {
  const uploadSubpath = extractFilesSubpath(src)
  if (uploadSubpath !== null) {
    if (!isPublicUploadSubpath(uploadSubpath)) {
      return null
    }
    const fullPath = resolveUploadPath(uploadSubpath)
    return fullPath ? await readFileOrNull(fullPath) : null
  }

  const pathname = toPathname(src)

  // Under `astro dev` there is no build output to read; the Vite dev server
  // holds the asset and no proxy sits in front of it, so fetching is safe.
  if (import.meta.env.DEV) {
    return await fetchOrNull(new URL(src, siteOrigin).href)
  }

  if (!pathname?.startsWith(BUILD_ASSET_PREFIX)) {
    return null
  }
  const clientRoot = path.join(process.cwd(), 'dist', 'client')
  const fullPath = path.normalize(path.join(clientRoot, pathname))
  if (!fullPath.startsWith(clientRoot + path.sep)) {
    return null
  }
  return await readFileOrNull(fullPath)
}

function toPathname(src: string): string | null {
  if (src.startsWith('/')) {
    return stripQuery(src)
  }
  try {
    return new URL(src).pathname
  } catch {
    return null
  }
}

function stripQuery(src: string): string {
  const queryStart = src.indexOf('?')
  return queryStart === -1 ? src : src.slice(0, queryStart)
}

async function readFileOrNull(fullPath: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(fullPath)
  } catch {
    return null
  }
}

async function fetchOrNull(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      return null
    }
    return Buffer.from(await response.arrayBuffer())
  } catch {
    return null
  }
}
