import sharpService from 'astro/assets/services/sharp'
import sharp from 'sharp'

import { MAX_IMAGE_PIXELS } from './imageUpload'

import type { ImageTransform } from 'astro'
import type { FormatEnum } from 'sharp'

const MAX_OUTPUT_DIMENSION = 2560
const MAX_SVG_DIMENSION = 1024

// outputBox bounds a transform to `max` on both sides, so one request's work stays small whatever the
// source's size. A requested height is dropped when a width is set, as Astro does without a fit, so w+h
// requests keep the source aspect. With a fit set, Astro's sharp service also refuses to enlarge.
function outputBox(transform: ImageTransform, max = MAX_OUTPUT_DIMENSION) {
  const width = Number(transform.width) || undefined
  const height = Number(transform.height) || undefined
  return {
    fit: 'inside' as const,
    width: Math.min(width ?? max, max),
    height: width ? max : Math.min(height ?? max, max),
  }
}

// rasterizeSvg relies on sharp rendering vector input straight at the resize target, so logos stay sharp at
// any size. An SVG's render cost grows with its filters times its output area, and librsvg cannot be
// interrupted mid-render, so SVGs (only legacy logos and avatars) get a smaller box and a time limit.
async function rasterizeSvg(input: Uint8Array, transform: ImageTransform) {
  const format = (typeof transform.format === 'string' ? transform.format : 'webp') as keyof FormatEnum
  const data = await sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS })
    .timeout({ seconds: 2 })
    .resize(outputBox(transform, MAX_SVG_DIMENSION))
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
      const { format } = await sharp(inputBuffer).metadata()
      if (format === 'svg') return await rasterizeSvg(inputBuffer, transform)
      // Without a format sharp keeps the source's, which would turn a stored AVIF into an AVIF encode.
      return await sharpService.transform(
        inputBuffer,
        { ...transform, ...outputBox(transform), format: transform.format ?? 'webp' },
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
