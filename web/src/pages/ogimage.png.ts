import { ogImageTemplates, type OgImageAllTemplatesWithProps } from '../components/OgImage'

import type { APIRoute } from 'astro'
import type { Misc } from 'ts-toolbelt'

function toJSON<T extends Misc.JSON.Value>(data: string | null | undefined): T | undefined {
  if (!data) return undefined
  try {
    return JSON.parse(data) as T
  } catch (_error) {
    return undefined
  }
}

export const GET: APIRoute = async (context) => {
  const { template, ...props } = toJSON<OgImageAllTemplatesWithProps>(
    context.url.searchParams.get('data')
  ) ?? { template: 'default' }

  if (!template as unknown) return ogImageTemplates.default({}, context)

  if (!(template in ogImageTemplates)) {
    console.error(`Invalid template: "${template}"`)
    return ogImageTemplates.default({}, context)
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
  const response = await ogImageTemplates[template](props as any, context)
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!response) {
    console.error(`Cannot generate image for template: ${template} and props: ${JSON.stringify(props)}`)
    return ogImageTemplates.default({}, context)
  }

  return response
}
