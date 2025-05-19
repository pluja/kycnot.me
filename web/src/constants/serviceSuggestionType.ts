import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { ServiceSuggestionType } from '@prisma/client'

type ServiceSuggestionTypeInfo<T extends string | null | undefined = string> = {
  value: T
  slug: string
  label: string
  icon: string
  default: boolean
}

export const {
  dataArray: serviceSuggestionTypes,
  dataObject: serviceSuggestionTypesById,
  getFn: getServiceSuggestionTypeInfo,
  getFnSlug: getServiceSuggestionTypeInfoBySlug,
  zodEnumBySlug: serviceSuggestionTypesZodEnumBySlug,
  zodEnumById: serviceSuggestionTypesZodEnumById,
  keyToSlug: serviceSuggestionTypeIdToSlug,
  slugToKey: serviceSuggestionTypeSlugToId,
} = makeHelpersForOptions(
  'value',
  (value): ServiceSuggestionTypeInfo<typeof value> => ({
    value,
    slug: value ? value.toLowerCase() : '',
    label: value ? transformCase(value, 'title') : String(value),
    icon: 'ri:question-line',
    default: false,
  }),
  [
    {
      value: 'CREATE_SERVICE',
      slug: 'create',
      label: 'Create',
      icon: 'ri:add-line',
      default: true,
    },
    {
      value: 'EDIT_SERVICE',
      slug: 'edit',
      label: 'Edit',
      icon: 'ri:pencil-line',
      default: false,
    },
  ] as const satisfies ServiceSuggestionTypeInfo<ServiceSuggestionType>[]
)
