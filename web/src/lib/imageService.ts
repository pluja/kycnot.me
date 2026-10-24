import sharpService from 'astro/assets/services/sharp'
import sharp from 'sharp'

import { MAX_IMAGE_PIXELS } from './imageUpload'

import type { ImageTransform } from 'astro'
import type { FormatEnum } from 'sharp'

const MAX_SVG_SCALE = 8

// rasterizeSvg renders an SVG at the density the requested width needs, so a small-viewBox logo stays sharp
// instead of being rendered at 72 dpi and scaled up. MAX_SVG_SCALE bounds the render cost, which grows with
// the square of the scale and cannot be interrupted once librsvg starts.
async function rasterizeSvg(input: Uint8Array, intrinsicWidth: number, transform: ImageTransform) {
  const width = Number(transform.width) || undefined
  const scale = width ? Math.min(Math.max(width / intrinsicWidth, 1), MAX_SVG_SCALE) : 1
  const format = (typeof transform.format === 'string' ? transform.format : 'webp') as keyof FormatEnum
  const data = await sharp(input, { density: 72 * scale, limitInputPixels: MAX_IMAGE_PIXELS })
    .resize({ width, withoutEnlargement: true })
    .toFormat(format)
    .toBuffer()
  return { data: new Uint8Array(data), format }
}

const imageService: typeof sharpService = {
  ...sharpService,
  async transform(inputBuffer, transform, config) {
    // Astro's sharp service returns the input untouched for SVG output, so it is never requested.
    if (transform.format === 'svg') throw new Error('SVG output is not served')
    try {
      // sharp sniffs the real format, so markup under an image name is refused rather than trusted by extension.
      const { format, width } = await sharp(inputBuffer).metadata()
      if (format === 'svg') return await rasterizeSvg(inputBuffer, width, transform)
      // Without a format sharp keeps the source's, which would turn a stored AVIF into an AVIF encode.
      return await sharpService.transform(
        inputBuffer,
        { ...transform, format: transform.format ?? 'webp' },
        config
      )
    } catch (error) {
      const src =
        typeof transform.src === 'string'
          ? transform.src
          : ((transform.src as { src?: string }).src ?? 'unknown')
      console.error(`[imageService] Failed to process image: ${src}`, {
        format: transform.format,
        width: transform.width,
        height: transform.height,
        error,
      })
      throw error
    }
  },
}

export default imageService
