import { normalizePublicOgImageProps } from './ogImageNormalize'
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
  const ogPath = urlWithParams(new URL('/ogimage.png', baseUrl), {
    data: JSON.stringify(normalizedOgImage),
  })
  return new URL(ogPath, baseUrl).href
}
