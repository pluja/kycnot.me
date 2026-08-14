import fs from 'node:fs/promises'
import path from 'node:path'

import sharp from 'sharp'

import { confineToRoot } from './confinePath'
import { isPublicUploadSubpath } from './uploadAccess'
import { extractFilesSubpath, resolveUploadPath } from './uploadPaths'

const BUILD_ASSET_PREFIX = '/_astro/'

// DEV_FS_PREFIX is how the Vite dev server addresses a source file that has no
// build output yet. It never appears in a production build.
const DEV_FS_PREFIX = '/@fs'

type ConvertOptions = {
  width: number
  height: number
  fit: 'contain' | 'cover'
}

type ReadOptions = {
  convert?: ConvertOptions
}

// readLocalImageAsDataUri resolves a same-origin image to a PNG data URI by
// reading it off local disk, covering both `/files/*` uploads and `/_astro/*`
// build output. Rendering happens inside the server, so resolving these over
// the public URL would route the request back through the front end, which is
// not guaranteed to serve the app's own asset fetches. Returns null when the image is missing, private or unreadable, leaving
// the caller to render without it.
export async function readLocalImageAsDataUri(
  src: string,
  { convert }: ReadOptions = {}
): Promise<string | null> {
  try {
    const buffer = await readLocalBytes(src)
    if (!buffer) {
      return null
    }

    // Always re-encoded rather than trusted by extension: upload filenames come
    // from the client, so the extension does not prove the format. sharp sniffs
    // the real one and satori only ever sees PNG.
    let image = sharp(buffer).png()
    if (convert) {
      image = image.resize(convert.width, convert.height, {
        fit: convert.fit,
        position: 'center',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
    }
    const png = await image.toBuffer()
    return `data:image/png;base64,${png.toString('base64')}`
  } catch {
    return null
  }
}

async function readLocalBytes(src: string): Promise<Buffer | null> {
  if (typeof src !== 'string' || src.length === 0) {
    return null
  }

  const uploadSubpath = extractFilesSubpath(src)
  if (uploadSubpath !== null) {
    if (!isPublicUploadSubpath(uploadSubpath)) {
      return null
    }
    const fullPath = resolveUploadPath(uploadSubpath)
    return fullPath ? await readFileOrNull(fullPath) : null
  }

  const pathname = toPathname(src)
  if (!pathname) {
    return null
  }

  if (import.meta.env.DEV && pathname.startsWith(DEV_FS_PREFIX + '/')) {
    // Confined to the project root: `src` reaches here straight from the
    // `?data=` query param, so an unconfined read would be arbitrary.
    const fullPath = confineToRoot(process.cwd(), pathname.slice(DEV_FS_PREFIX.length))
    return fullPath ? await readFileOrNull(fullPath) : null
  }

  if (!pathname.startsWith(BUILD_ASSET_PREFIX)) {
    console.warn(`[ogImage] Not a local image, rendering without it: ${pathname.slice(0, 100)}`)
    return null
  }

  const clientRoot = path.join(process.cwd(), 'dist', 'client')
  const fullPath = confineToRoot(clientRoot, pathname.slice(1))
  return fullPath ? await readFileOrNull(fullPath) : null
}

function toPathname(src: string): string | null {
  if (src.startsWith('/')) {
    const queryStart = src.indexOf('?')
    return queryStart === -1 ? src : src.slice(0, queryStart)
  }
  try {
    return new URL(src).pathname
  } catch {
    return null
  }
}

async function readFileOrNull(fullPath: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(fullPath)
  } catch {
    return null
  }
}
