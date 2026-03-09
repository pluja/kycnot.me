import sharpService from 'astro/assets/services/sharp'

function isMarkup(buffer: Uint8Array): boolean {
  let i = 0
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) i = 3
  while (i < buffer.length && (buffer[i] === 0x09 || buffer[i] === 0x0a || buffer[i] === 0x0d || buffer[i] === 0x20))
    i++

  if (buffer[i] !== 0x3c) return false

  const tag = String.fromCharCode(...buffer.slice(i + 1, i + 10)).toLowerCase()
  return (
    tag.startsWith('!doctype') ||
    tag.startsWith('html') ||
    tag.startsWith('head') ||
    tag.startsWith('svg') ||
    tag.startsWith('?xml')
  )
}

const imageService: typeof sharpService = {
  ...sharpService,
  async transform(inputBuffer, transform, config) {
    const src =
      typeof transform.src === 'string'
        ? transform.src
        : (transform.src as { src?: string })?.src ?? 'unknown'

    if (isMarkup(inputBuffer)) {
      const tag = String.fromCharCode(...inputBuffer.slice(0, 10)).trim().toLowerCase()
      if (tag.startsWith('<svg') || tag.startsWith('<?xml')) {
        return { data: inputBuffer, format: 'svg' }
      }
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
