import sharp from 'sharp'

export const MAX_IMAGE_PIXELS = 40_000_000
const WEBP_MAX_DIMENSION = 16_383

const ACCEPTED_DECODED_FORMATS = new Set(['png', 'jpeg', 'webp'])

// startsLikeAcceptedImage checks the PNG, JPEG or WebP signature before sharp reads anything, so the decoders for
// every other format (HEIF, SVG, TIFF, GIF), each a history of vulnerabilities, never parse uploaded bytes.
const startsLikeAcceptedImage = (input: Buffer) =>
  input.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
  input.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ||
  (input.subarray(0, 4).toString('latin1') === 'RIFF' && input.subarray(8, 12).toString('latin1') === 'WEBP')

// reencodeUploadedImage decodes an upload and writes a fresh WebP, so only pixels reach the disk: no
// markup, polyglot payload or EXIF/GPS metadata survives, whatever the client claimed the file was.
export async function reencodeUploadedImage(
  input: Buffer,
  maxWidth: number,
  maxHeight = WEBP_MAX_DIMENSION
): Promise<Buffer> {
  if (!startsLikeAcceptedImage(input)) throw new Error('Unsupported image format')
  const image = sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'error' })
  const metadata = await image.metadata()
  if (!ACCEPTED_DECODED_FORMATS.has(metadata.format) || (metadata.pages ?? 1) > 1) {
    throw new Error(`Unsupported image format: ${metadata.format}`)
  }
  return image
    .rotate()
    .resize({ width: maxWidth, height: maxHeight, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 90 })
    .toBuffer()
}
