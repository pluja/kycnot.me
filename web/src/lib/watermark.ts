import sharp from 'sharp'

const WATERMARK_TEXT = 'KYCNOT.ME'

// White text is low-contrast on light images but high-contrast (too prominent)
// on dark ones, so the opacity scales with the image's mean luminance: faint on
// dark images, a touch stronger on light ones. A faint dark stroke keeps it
// legible on light/mid backgrounds.
function buildWatermarkSvg(width: number, height: number, luminance: number): Buffer {
  const fontSize = Math.max(18, Math.min(44, Math.round(Math.min(width, height) / 14)))
  const stepX = Math.round(fontSize * 9)
  const stepY = Math.round(fontSize * 5)
  const fontSizeStr = fontSize.toString()

  const brightness = Math.min(1, Math.max(0, luminance / 255))
  const fillOpacity = (0.045 + brightness * 0.075).toFixed(3)
  const strokeOpacity = (0.04 + brightness * 0.04).toFixed(3)

  const texts: string[] = []
  let row = 0
  for (let y = 0; y <= height + stepY; y += stepY) {
    // Offset every other row so the watermark reads as a diagonal brick layout.
    const offset = row % 2 === 0 ? 0 : Math.round(stepX / 2)
    for (let x = -stepX + offset; x <= width + stepX; x += stepX) {
      const xs = x.toString()
      const ys = y.toString()
      texts.push(
        `<text x="${xs}" y="${ys}" transform="rotate(-30 ${xs} ${ys})" font-family="DejaVu Sans, sans-serif" font-size="${fontSizeStr}" font-weight="bold" fill="rgba(255,255,255,${fillOpacity})" stroke="rgba(0,0,0,${strokeOpacity})" stroke-width="1">${WATERMARK_TEXT}</text>`
      )
    }
    row++
  }

  const svg = `<svg width="${width.toString()}" height="${height.toString()}" xmlns="http://www.w3.org/2000/svg">${texts.join('')}</svg>`

  return Buffer.from(svg)
}

// watermarkImage tiles WATERMARK_TEXT diagonally over the image and re-encodes
// in the original format. Input that sharp cannot decode is returned untouched.
export async function watermarkImage(input: Buffer): Promise<Buffer> {
  let width = 0
  let height = 0
  let luminance = 200
  try {
    const probe = sharp(input)
    const [metadata, stats] = await Promise.all([probe.metadata(), probe.stats()])
    width = metadata.width
    height = metadata.height
    const channelMean = (index: number) => stats.channels[index]?.mean ?? 200
    luminance =
      stats.channels.length >= 3
        ? 0.299 * channelMean(0) + 0.587 * channelMean(1) + 0.114 * channelMean(2)
        : channelMean(0)
  } catch {
    return input
  }

  if (!width || !height) return input

  const overlay = buildWatermarkSvg(width, height, luminance)
  return sharp(input)
    .composite([{ input: overlay, blend: 'over' }])
    .toBuffer()
}
