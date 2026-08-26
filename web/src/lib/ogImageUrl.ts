import { OG_IMAGE_SIGNING_SECRET } from 'astro:env/server'

import { normalizePublicOgImageProps } from './ogImageNormalize'
import { signOgImageData } from './ogImageSignature'
import { urlWithParams } from './urls'

import type { OgImagePublicTemplateWithProps } from './ogImageProps'

export function makeOgImageUrl(
  ogImage: OgImagePublicTemplateWithProps | string | undefined,
  baseUrl: URL | string
): string {
  if (typeof ogImage === 'string') {
    return new URL(ogImage, baseUrl).href
  }

  const normalizedOgImage = ogImage ? normalizePublicOgImageProps(ogImage) : {}
  const data = JSON.stringify(normalizedOgImage)
  const ogPath = urlWithParams(new URL('/ogimage.png', baseUrl), {
    data,
    sig: signOgImageData(OG_IMAGE_SIGNING_SECRET, data),
  })
  return new URL(ogPath, baseUrl).href
}
