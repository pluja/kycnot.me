import { ogImageTemplates } from '../components/OgImage'
import { urlParamsToObject } from '../lib/urls'

import type { APIRoute } from 'astro'

export const GET: APIRoute = (context) => {
  const { template, ...props } = urlParamsToObject(context.url.searchParams)

  if (!template) return ogImageTemplates.default({}, context)

  if (!(template in ogImageTemplates)) {
    console.error(`Invalid template: "${template}"`)
    return ogImageTemplates.default({}, context)
  }

  const response = ogImageTemplates[template as keyof typeof ogImageTemplates](props, context)
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!response) {
    console.error(`Cannot generate image for template: ${template} and props: ${JSON.stringify(props)}`)
    return ogImageTemplates.default({}, context)
  }

  return response
}
