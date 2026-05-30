import sharp from 'sharp'

const WATERMARK_TEXT = 'KYCNOT.ME'

// A light fill with a faint dark stroke keeps the tiled text legible over both
// light and dark images, so we skip the per-image brightness analysis the
// standalone watermark_batch.sh does.
function buildWatermarkSvg(width: number, height: number): Buffer {
  const tile = 340
  const tileHeight = Math.round(tile * 0.55)
  const textY = Math.round(tile * 0.35)
  const fontSize = Math.max(26, Math.round(Math.min(width, height) / 14))

  const svg = [
    `<svg width="${width.toString()}" height="${height.toString()}" xmlns="http://www.w3.org/2000/svg">`,
    '  <defs>',
    `    <pattern id="wm" width="${tile.toString()}" height="${tileHeight.toString()}" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">`,
    `      <text x="0" y="${textY.toString()}" font-family="DejaVu Sans, sans-serif" font-size="${fontSize.toString()}" font-weight="bold" fill="rgba(255,255,255,0.13)" stroke="rgba(0,0,0,0.07)" stroke-width="1">${WATERMARK_TEXT}</text>`,
    '    </pattern>',
    '  </defs>',
    '  <rect width="100%" height="100%" fill="url(#wm)" />',
    '</svg>',
  ].join('\n')

  return Buffer.from(svg)
}

// watermarkImage tiles WATERMARK_TEXT diagonally over the image and re-encodes
// in the original format. Input that sharp cannot decode is returned untouched.
export async function watermarkImage(input: Buffer): Promise<Buffer> {
  let width = 0
  let height = 0
  try {
    const metadata = await sharp(input).metadata()
    width = metadata.width
    height = metadata.height
  } catch {
    return input
  }

  if (!width || !height) return input

  const overlay = buildWatermarkSvg(width, height)
  return sharp(input)
    .composite([{ input: overlay, blend: 'over' }])
    .toBuffer()
}
