import sharpService from 'astro/assets/services/sharp'

// XML/SVG magic byte patterns — reject these early before passing to Sharp.
// Sharp uses libvips + glib's XML parser for SVG, which is vulnerable to
// deeply nested XML bombs sent to the /_image endpoint.
const XML_SIGNATURES = [
  [0x3c, 0x3f, 0x78, 0x6d, 0x6c], // <?xml
  [0x3c, 0x73, 0x76, 0x67], //       <svg
  [0xef, 0xbb, 0xbf, 0x3c], //       UTF-8 BOM + <
]

function isXmlOrSvg(buffer: Uint8Array): boolean {
  return XML_SIGNATURES.some((sig) => sig.every((byte, i) => buffer[i] === byte))
}

const imageService: typeof sharpService = {
  ...sharpService,
  async transform(inputBuffer, transform, config) {
    const src =
      typeof transform.src === 'string'
        ? transform.src
        : (transform.src as { src?: string })?.src ?? 'unknown'

    if (isXmlOrSvg(inputBuffer)) {
      return { data: inputBuffer, format: 'svg' }
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
