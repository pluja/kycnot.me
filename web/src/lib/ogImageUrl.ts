import { urlWithParams } from './urls'

import type { OgImagePublicTemplateWithProps } from './ogImageProps'

export function makeOgImageUrl(
  ogImage: OgImagePublicTemplateWithProps | string | undefined,
  baseUrl: URL | string
): string {
  if (typeof ogImage === 'string') {
    return new URL(ogImage, baseUrl).href
  }

  const ogPath = urlWithParams(new URL('/ogimage.png', baseUrl), {
    data: JSON.stringify(ogImage ?? {}),
  })
  return new URL(ogPath, baseUrl).href
}
