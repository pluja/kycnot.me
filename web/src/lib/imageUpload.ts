import sharp from 'sharp'

const ACCEPTED_DECODED_FORMATS = new Set(['png', 'jpeg', 'webp', 'heif'])

// reencodeUploadedImage decodes an upload and writes a fresh WebP, so only pixels reach the disk: no
// markup, polyglot payload or EXIF/GPS metadata survives, whatever the client claimed the file was.
export async function reencodeUploadedImage(input: Buffer, maxDimension: number): Promise<Buffer> {
  const image = sharp(input, { limitInputPixels: 40_000_000, failOn: 'error' })
  const metadata = await image.metadata()
  if (!ACCEPTED_DECODED_FORMATS.has(metadata.format) || (metadata.pages ?? 1) > 1) {
    throw new Error(`Unsupported image format: ${metadata.format}`)
  }
  return image
    .rotate()
    .resize({ width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 90 })
    .toBuffer()
}
