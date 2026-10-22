import sharpService from 'astro/assets/services/sharp'

function leadingTag(buffer: Uint8Array): string | null {
  let i = 0
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) i = 3
  while (
    i < buffer.length &&
    (buffer[i] === 0x09 || buffer[i] === 0x0a || buffer[i] === 0x0d || buffer[i] === 0x20)
  ) {
    i++
  }
  if (buffer[i] !== 0x3c) return null
  return String.fromCharCode(...buffer.slice(i + 1, i + 10)).toLowerCase()
}

function isMarkup(buffer: Uint8Array): boolean {
  const tag = leadingTag(buffer)
  return tag !== null && ['!doctype', 'html', 'head', 'svg', '?xml'].some((prefix) => tag.startsWith(prefix))
}

function isSvgMarkup(buffer: Uint8Array): boolean {
  const tag = leadingTag(buffer)
  return tag !== null && (tag.startsWith('svg') || tag.startsWith('?xml'))
}

const imageService: typeof sharpService = {
  ...sharpService,
  async transform(inputBuffer, transform, config) {
    const src =
      typeof transform.src === 'string'
        ? transform.src
        : ((transform.src as { src?: string }).src ?? 'unknown')

    // SVG reaches sharp and is rasterized, never passed through, since /_image refuses f=svg. Other markup
    // (HTML saved under an image name) is not an image at all.
    if (isMarkup(inputBuffer) && !isSvgMarkup(inputBuffer)) {
      console.warn(`[imageService] Rejected non-image markup input for: ${src}`)
      throw new Error('Input buffer contains unsupported image format')
    }

    try {
      return await sharpService.transform(inputBuffer, transform, config)
    } catch (error) {
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
