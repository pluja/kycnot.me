import type { VerificationStatus } from '@prisma/client'

export const badgeThemes = ['dark', 'light'] as const
export type BadgeTheme = (typeof badgeThemes)[number]

export const badgeSizes = [
  {
    id: 'lg',
    label: 'Large',
    width: 920,
    height: 230,
    featured: true,
    supportsDetails: true,
  },
  {
    id: 'sm',
    label: 'Medium',
    width: 520,
    height: 160,
    featured: false,
    supportsDetails: true,
  },
  {
    id: 'xs',
    label: 'Compact',
    width: 320,
    height: 56,
    featured: false,
    supportsDetails: false,
  },
] as const

export type BadgeSize = (typeof badgeSizes)[number]['id']

export type BadgeOptions = {
  score: boolean
  rating: boolean
  kyc: boolean
  light: boolean
}

export const defaultBadgeOptions = {
  score: true,
  rating: true,
  kyc: true,
  light: false,
} as const satisfies BadgeOptions

export function isBadgeTheme(value: string | null): value is BadgeTheme {
  return badgeThemes.some((theme) => theme === value)
}

export function isBadgeSize(value: string | null): value is BadgeSize {
  return badgeSizes.some((size) => size.id === value)
}

export function isEmbeddableBadgeStatus(
  verificationStatus: VerificationStatus | null
): verificationStatus is 'APPROVED' | 'VERIFICATION_SUCCESS' {
  return verificationStatus === 'APPROVED' || verificationStatus === 'VERIFICATION_SUCCESS'
}

export function getBadgeSize(sizeId: BadgeSize) {
  const size = badgeSizes.find((item) => item.id === sizeId)
  if (!size) {
    throw new Error(`Unsupported badge size: ${sizeId}`)
  }

  return size
}

export function getBadgeDimensionsLabel(sizeId: BadgeSize) {
  const size = getBadgeSize(sizeId)
  return `${String(size.width)} x ${String(size.height)}`
}

export function getServiceBadgeImageUrl(
  serviceSlug: string,
  siteOrigin: string,
  sizeId: BadgeSize,
  options: BadgeOptions = defaultBadgeOptions
) {
  const size = getBadgeSize(sizeId)
  const params = new URLSearchParams({
    size: size.id,
    theme: options.light ? 'light' : 'dark',
  })

  if (size.supportsDetails) {
    if (options.score) params.set('score', '1')
    if (options.rating) params.set('rating', '1')
    if (options.kyc) params.set('kyc', '1')
  }

  return `${siteOrigin}/badge/${serviceSlug}.png?${params.toString()}`
}

export function escapeHtmlAttribute(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

export function getServiceBadgeEmbedCode(serviceName: string, serviceUrl: string, badgeImageUrl: string) {
  return `<a href="${escapeHtmlAttribute(serviceUrl)}"><img src="${escapeHtmlAttribute(badgeImageUrl)}" alt="${escapeHtmlAttribute(serviceName)} verification badge from KYCnot.me" /></a>`
}
