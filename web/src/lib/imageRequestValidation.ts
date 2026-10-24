// MAX_IMAGE_DIMENSION rejects absurd requested sizes; the transform itself bounds
// the output (imageService.ts).
export const MAX_IMAGE_DIMENSION = 4096

// ACCEPTED_PARAMS are the only ones the site's own image URLs carry. Anything
// else (quality, fit, position, background) changes the output without being
// part of the cache key, or makes the transform far more expensive.
const ACCEPTED_PARAMS = new Set(['href', 'w', 'h', 'f'])

// ALLOWED_OUTPUT_FORMATS mirrors Astro's VALID_OUTPUT_FORMATS. `gif` is
// deliberately excluded: it is input-only for Astro and would trigger an
// expensive palette-quantization encode. `avif` is too: no page requests it,
// and an AVIF encode costs far more CPU than WebP.
const ALLOWED_OUTPUT_FORMATS = new Set(['png', 'webp', 'jpeg', 'jpg'])

// parsedIntInRange parses the way Astro's baseService.parseURL does, with
// parseInt(). Validating with Number() instead would let scientific-notation
// values (e.g. "40960000e-4" -> 4096) pass here while parseURL feeds sharp the
// mantissa (40960000), so the size checked would not be the size used.
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

// validateImageParams rejects `/_image` requests outside what the site's own
// image URLs carry, so every option that changes the output is in the cache key
// and no request can choose a costly one. Returns an error message when
// invalid, or null when safe to process.
export function validateImageParams(params: URLSearchParams): string | null {
  for (const key of params.keys()) {
    if (!ACCEPTED_PARAMS.has(key)) return `Invalid "${key}" parameter`
  }

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

  const format = params.get('f')
  if (format !== null && !ALLOWED_OUTPUT_FORMATS.has(format)) {
    return 'Invalid "f" parameter'
  }

  return null
}
