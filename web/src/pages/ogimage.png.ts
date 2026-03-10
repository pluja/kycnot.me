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

  if (!template || !(template in ogImageTemplates)) {
    return ogImageTemplates.default({}, context)
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
    const response = await ogImageTemplates[template](props as any, context)
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!response) {
      return ogImageTemplates.default({}, context)
    }
    return response
  } catch (error) {
    console.warn(`[ogimage] Failed to render template "${template}":`, error instanceof Error ? error.message : error)
    return ogImageTemplates.default({}, context)
  }
}
