import {
  createOgImageTextNormalizer,
  isAllowedOgImageSource,
  isValidOgImageIcon,
  OG_IMAGE_LIMITS,
} from './ogImageInput'

import type { OgImagePublicTemplateWithProps } from './ogImageProps'

export function normalizePublicOgImageProps(
  ogImage: OgImagePublicTemplateWithProps
): OgImagePublicTemplateWithProps {
  switch (ogImage.template) {
    case 'default':
      return { template: 'default' }
    case 'service': {
      const normalizeText = createOgImageTextNormalizer(OG_IMAGE_LIMITS.service.totalText)
      const title = normalizeRequiredText(
        normalizeText,
        ogImage.title,
        OG_IMAGE_LIMITS.service.title,
        'KYCnot.me'
      )
      const description = normalizeText(ogImage.description, OG_IMAGE_LIMITS.service.description)
      const categories: typeof ogImage.categories = []
      for (const category of ogImage.categories.slice(0, OG_IMAGE_LIMITS.maxCategories)) {
        const name = normalizeText(category.name, OG_IMAGE_LIMITS.service.categoryName)
        if (!name.trim()) continue
        categories.push({
          name,
          icon: isValidOgImageIcon(category.icon) ? category.icon : 'ri:question-line',
        })
      }

      return {
        template: 'service',
        title,
        description,
        categories,
        score: normalizeOgImageScore(ogImage.score),
        imageUrl: normalizeImageSource(ogImage.imageUrl),
        verificationStatus: ogImage.verificationStatus,
      }
    }
    case 'generic': {
      const normalizeText = createOgImageTextNormalizer(OG_IMAGE_LIMITS.generic.totalText)
      return {
        template: 'generic',
        title: normalizeRequiredText(
          normalizeText,
          ogImage.title,
          OG_IMAGE_LIMITS.generic.title,
          'KYCnot.me'
        ),
        description:
          ogImage.description == null
            ? ogImage.description
            : normalizeText(ogImage.description, OG_IMAGE_LIMITS.generic.description),
        icon: ogImage.icon && isValidOgImageIcon(ogImage.icon) ? ogImage.icon : undefined,
      }
    }
    case 'blog': {
      const normalizeText = createOgImageTextNormalizer(OG_IMAGE_LIMITS.blog.totalText)
      return {
        template: 'blog',
        title: normalizeRequiredText(
          normalizeText,
          ogImage.title,
          OG_IMAGE_LIMITS.blog.title,
          'KYCnot.me Blog'
        ),
        coverImage: normalizeImageSource(ogImage.coverImage),
        author:
          ogImage.author == null
            ? ogImage.author
            : normalizeText(ogImage.author, OG_IMAGE_LIMITS.blog.author) || undefined,
        publishedAt: normalizePublishedAt(ogImage.publishedAt),
      }
    }
  }
}

function normalizeRequiredText(
  normalizeText: (value: string, fieldLimit: number) => string,
  value: string,
  fieldLimit: number,
  fallback: string
): string {
  const normalized = normalizeText(value, fieldLimit)
  return normalized.trim() ? normalized : normalizeText(fallback, fieldLimit)
}

function normalizeImageSource(value: string | null | undefined): string | null | undefined {
  return typeof value !== 'string' || isAllowedOgImageSource(value) ? value : undefined
}

function normalizePublishedAt(value: string | null | undefined): string | null | undefined {
  if (typeof value !== 'string') return value
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

export function normalizeOgImageScore(value: number): number {
  return Number.isFinite(value)
    ? Math.min(OG_IMAGE_LIMITS.score.max, Math.max(OG_IMAGE_LIMITS.score.min, Math.round(value)))
    : OG_IMAGE_LIMITS.score.min
}

export function normalizeOgImageRating(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null
  return Math.min(OG_IMAGE_LIMITS.rating.max, Math.max(OG_IMAGE_LIMITS.rating.min, value))
}

export function normalizeOgImageKycLevel(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null
  return Math.min(OG_IMAGE_LIMITS.kycLevel.max, Math.max(OG_IMAGE_LIMITS.kycLevel.min, Math.round(value)))
}
