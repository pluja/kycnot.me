import sharp from 'sharp'

export const MAX_IMAGE_PIXELS = 40_000_000
const WEBP_MAX_DIMENSION = 16_383

const ACCEPTED_DECODED_FORMATS = new Set(['png', 'jpeg', 'webp', 'heif'])

// reencodeUploadedImage decodes an upload and writes a fresh WebP, so only pixels reach the disk: no
// markup, polyglot payload or EXIF/GPS metadata survives, whatever the client claimed the file was.
export async function reencodeUploadedImage(input: Buffer, maxWidth: number): Promise<Buffer> {
  const image = sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'error' })
  const metadata = await image.metadata()
  if (!ACCEPTED_DECODED_FORMATS.has(metadata.format) || (metadata.pages ?? 1) > 1) {
    throw new Error(`Unsupported image format: ${metadata.format}`)
  }
  return image
    .rotate()
    .resize({ width: maxWidth, height: WEBP_MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 90 })
    .toBuffer()
}
