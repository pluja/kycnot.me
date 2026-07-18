// MAX_IMAGE_DIMENSION caps a requested output dimension. It bounds the work a
// single `/_image` request can trigger (output pixels grow with width*height),
// while staying well above any dimension the site legitimately requests.
export const MAX_IMAGE_DIMENSION = 4096

// ALLOWED_OUTPUT_FORMATS mirrors Astro's VALID_OUTPUT_FORMATS. `gif` is
// deliberately excluded: it is input-only for Astro and would trigger an
// expensive palette-quantization encode.
const ALLOWED_OUTPUT_FORMATS = new Set(['avif', 'png', 'webp', 'jpeg', 'jpg', 'svg'])

// NAMED_QUALITIES are the presets sharp accepts in place of a numeric 1-100 value.
const NAMED_QUALITIES = new Set(['low', 'mid', 'high', 'max'])

// parsedIntInRange parses the way Astro's baseService.parseURL does, with
// parseInt(). Validating with Number() instead would let scientific-notation
// values (e.g. "40960000e-4" -> 4096) pass here while parseURL feeds sharp the
// mantissa (40960000), reopening the upscaling DoS.
function parsedIntInRange(raw: string, min: number, max: number): boolean {
  const value = parseInt(raw, 10)
  return !Number.isNaN(value) && value >= min && value <= max
}

// isProcessableHref accepts only the href shapes Astro emits: a root-relative
// path (site assets and /files/ uploads) or an absolute http/https URL. Anything
// else (bare word, scheme-relative //host, junk) would otherwise reach Astro's
// default image endpoint and throw an uncaught 500.
function isProcessableHref(href: string): boolean {
  if (href.startsWith('//')) return false
  if (href.startsWith('/')) return true
  try {
    const { protocol } = new URL(href)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

// validateImageParams rejects `/_image` requests whose parameters fall outside
// what Astro generates. Without it a user-supplied `w`/`h` reaches sharp
// unbounded, so one request can upscale a tiny source into a multi-gigapixel
// bitmap and exhaust CPU and memory. Returns an error message when invalid, or
// null when safe to process.
export function validateImageParams(params: URLSearchParams): string | null {
  const href = params.get('href')
  if (href === null || !isProcessableHref(href)) {
    return 'Invalid "href" parameter'
  }

  for (const key of ['w', 'h'] as const) {
    const raw = params.get(key)
    if (raw !== null && !parsedIntInRange(raw, 1, MAX_IMAGE_DIMENSION)) {
      return `Invalid "${key}" parameter`
    }
  }

  const quality = params.get('q')
  if (quality !== null && !NAMED_QUALITIES.has(quality) && !parsedIntInRange(quality, 1, 100)) {
    return 'Invalid "q" parameter'
  }

  const format = params.get('f')
  if (format !== null && !ALLOWED_OUTPUT_FORMATS.has(format)) {
    return 'Invalid "f" parameter'
  }

  // Astro only emits `f=svg` for an SVG source (MyPicture keys on the `.svg`
  // extension). A tampered `f=svg` on a raster would otherwise be returned by
  // sharp's service as the raster bytes labelled `image/svg+xml`, so gate it on
  // the href actually being an SVG.
  if (format === 'svg') {
    const hrefPath = (params.get('href') ?? '').split(/[?#]/)[0] ?? ''
    if (!hrefPath.toLowerCase().endsWith('.svg')) {
      return 'Invalid "f" parameter'
    }
  }

  return null
}
