import fs from 'node:fs/promises'
import path from 'node:path'

import sharp from 'sharp'

import { confineToRoot } from './confinePath'
import { reportMissingAsset } from './missingAssets'
import { isPublicUploadSubpath } from './uploadAccess'
import { extractFilesSubpath, resolveUploadPath } from './uploadPaths'

const BUILD_ASSET_PREFIX = '/_astro/'

// DEV_FS_PREFIX is how the Vite dev server addresses a source file that has no
// build output yet. It never appears in a production build.
const DEV_FS_PREFIX = '/@fs'

type ResizeOptions = {
  width: number
  height: number
  fit: 'contain' | 'cover'
}

type ReadOptions = {
  resize?: ResizeOptions
}

// readLocalImageAsDataUri resolves a same-origin image to a PNG data URI by
// reading it off local disk, covering both `/files/*` uploads and `/_astro/*`
// build output. Rendering happens inside the server, so resolving these over
// the public URL would route the request back through the front end, which is
// not guaranteed to serve the app's own asset fetches. Returns null when the image is missing, private or unreadable.
export async function readLocalImageAsDataUri(
  src: string,
  { resize }: ReadOptions = {}
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
    if (resize) {
      image = image.resize(resize.width, resize.height, {
        fit: resize.fit,
        position: 'center',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
    }
    const png = await image.toBuffer()
    return `data:image/png;base64,${png.toString('base64')}`
  } catch {
    // Reported rather than swallowed: a decode that fails on a file we could
    // read is as likely to be pressure on sharp as a genuinely corrupt upload.
    reportMissingAsset()
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
    console.warn(`[ogimage] Not a local image, rendering without it: ${forLog(pathname)}`)
    return null
  }

  // Confined to the hashed-asset directory rather than the whole client root:
  // `UPLOAD_DIR` can sit under `public/`, which builds into the client root, so
  // a wider root would put private case evidence in reach of `/_astro/../`.
  const assetRoot = path.join(process.cwd(), 'dist', 'client', '_astro')
  const fullPath = confineToRoot(assetRoot, pathname.slice(BUILD_ASSET_PREFIX.length))
  return fullPath ? await readFileOrNull(fullPath) : null
}

// forLog strips the control characters that would let an attacker-supplied
// path forge extra log lines.
function forLog(value: string): string {
  return value.slice(0, 100).replace(/[\p{C}]/gu, '')
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
    // The path resolved into an allowed root and still would not read, so the
    // file is missing or the volume is not mounted yet. Both can fix themselves,
    // unlike the sources rejected above.
    reportMissingAsset()
    return null
  }
}
