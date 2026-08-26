export const OG_IMAGE_LIMITS = {
  rawData: 4096,
  maxCategories: 8,
  icon: 100,
  imageSource: 512,
  service: {
    title: 120,
    description: 240,
    categoryName: 50,
    totalText: 480,
  },
  generic: {
    title: 120,
    description: 300,
    totalText: 320,
  },
  blog: {
    title: 120,
    author: 100,
    totalText: 200,
  },
  badge: {
    name: 120,
  },
  score: {
    min: 0,
    max: 10,
  },
  rating: {
    min: 0,
    max: 5,
  },
  kycLevel: {
    min: 0,
    max: 4,
  },
} as const

export const OG_IMAGE_ICON_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/

const LOCAL_IMAGE_PREFIXES = ['/files/', '/_astro/', '/@fs/'] as const
const EMOJI_GRAPHEME_PATTERN =
  /\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|\u20e3|\ufe0f/u
// Extended_Pictographic covers these, but satori does not treat them as emoji
// and the bundled fonts draw them, so stripping would eat real copy: Bitcoin(R)
// would render as Bitcoin. A trailing U+FE0F asks for the emoji form instead,
// which satori does classify as emoji, so that case falls through to the strip.
const TEXT_PRESENTATION_PICTOGRAPHS = /^[\u00a9\u00ae\u2122\u203c\u2049\u2139]$/
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

// stripOgImageEmoji removes emoji graphemes. No emoji font is bundled and the
// renderer loads no remote sprites, so an emoji left in card copy draws as a
// tofu box baked into a year-long immutable cache. Segmenting rather than
// replacing keeps ZWJ sequences, modifiers and flags whole.
export function stripOgImageEmoji(value: string): string {
  let stripped = ''
  for (const { segment } of graphemeSegmenter.segment(value)) {
    if (!isEmojiGrapheme(segment)) stripped += segment
  }
  return stripped
}

export function isWithinOgImageTextBudget(values: readonly string[], budget: number): boolean {
  return values.reduce((total, value) => total + value.length, 0) <= budget
}

export function createOgImageTextNormalizer(
  totalBudget: number
): (value: string, fieldLimit: number) => string {
  let remainingText = totalBudget

  return (value: string, fieldLimit: number): string => {
    let normalized = ''
    let remainingFieldText = fieldLimit

    for (const { segment } of graphemeSegmenter.segment(value)) {
      if (remainingText === 0 || remainingFieldText === 0) break
      if (isEmojiGrapheme(segment)) continue
      if (segment.length > remainingText || segment.length > remainingFieldText) continue

      normalized += segment
      remainingText -= segment.length
      remainingFieldText -= segment.length
    }

    return normalized
  }
}

export function isValidOgImageIcon(value: string): boolean {
  return value.length <= OG_IMAGE_LIMITS.icon && OG_IMAGE_ICON_PATTERN.test(value)
}

export function isAllowedOgImageSource(value: string): boolean {
  if (value.length > OG_IMAGE_LIMITS.imageSource || /[\p{C}\\]/u.test(value)) return false

  const pathname = value.split(/[?#]/, 1)[0] ?? ''
  let decodedPathname: string
  try {
    decodedPathname = decodeURIComponent(pathname)
  } catch {
    return false
  }

  if (decodedPathname.split('/').some((segment) => segment === '.' || segment === '..')) {
    return false
  }
  return LOCAL_IMAGE_PREFIXES.some(
    (prefix) =>
      pathname.length > prefix.length && pathname.startsWith(prefix) && decodedPathname.startsWith(prefix)
  )
}

function isEmojiGrapheme(value: string): boolean {
  if (TEXT_PRESENTATION_PICTOGRAPHS.test(value)) return false
  return EMOJI_GRAPHEME_PATTERN.test(value)
}
