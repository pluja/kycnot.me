import { badgeOgImagePropsSchemas, publicOgImagePropsSchemas, summarizeIssues } from './ogImageProps'

import type { OgImageBadgeTemplateName, OgImageProps, OgImagePublicTemplateName } from './ogImageProps'

type ParsedPublicOgImageRequest = {
  success: true
  templateName: OgImagePublicTemplateName
  props: OgImageProps<OgImagePublicTemplateName>
}

type RejectedPublicOgImageRequest = {
  success: false
  response: 'default' | 'reject'
  reason: string
}

export type PublicOgImageRequestResult = ParsedPublicOgImageRequest | RejectedPublicOgImageRequest

export function parsePublicOgImageRequest(rawData: string | null): PublicOgImageRequestResult {
  const data = parseJson(rawData)
  if (data === undefined) return rejectWithDefault('Malformed JSON')
  if (!isRecord(data)) return rejectWithDefault('Image data must be a JSON object')

  const hasTemplate = Object.hasOwn(data, 'template')
  const templateName = hasTemplate ? data.template : 'default'
  if (isBadgeTemplateName(templateName)) {
    return {
      success: false,
      response: 'reject',
      reason: 'Badge templates are not available from the public endpoint',
    }
  }
  if (!isPublicTemplateName(templateName)) return rejectWithDefault('Unknown template')

  const { template: _template, ...props } = data
  const parsedProps = publicOgImagePropsSchemas[templateName].safeParse(props)
  if (!parsedProps.success) {
    return rejectWithDefault(`Invalid props for "${templateName}": ${summarizeIssues(parsedProps.error)}`)
  }

  return {
    success: true,
    templateName,
    props: parsedProps.data,
  }
}

function parseJson(rawData: string | null): unknown {
  if (!rawData) return {}

  try {
    return JSON.parse(rawData) as unknown
  } catch {
    return undefined
  }
}

function rejectWithDefault(reason: string): RejectedPublicOgImageRequest {
  return { success: false, response: 'default', reason }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPublicTemplateName(value: unknown): value is OgImagePublicTemplateName {
  return typeof value === 'string' && Object.hasOwn(publicOgImagePropsSchemas, value)
}

function isBadgeTemplateName(value: unknown): value is OgImageBadgeTemplateName {
  return typeof value === 'string' && Object.hasOwn(badgeOgImagePropsSchemas, value)
}
