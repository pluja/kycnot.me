import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { TailwindColor } from '../lib/colors'
import type { ServiceSuggestionType } from '@prisma/client'

type ServiceSuggestionTypeInfo<T extends string | null | undefined = string> = {
  value: T
  slug: string
  label: string
  icon: string
  order: number
  default: boolean
  color: TailwindColor
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
    label: value ? transformCase(value.replace('_', ' '), 'title') : String(value),
    icon: 'ri:question-line',
    order: Infinity,
    default: false,
    color: 'zinc',
  }),
  [
    {
      value: 'CREATE_SERVICE',
      slug: 'create',
      label: 'Create',
      icon: 'ri:add-line',
      order: 1,
      default: true,
      color: 'green',
    },
    {
      value: 'EDIT_SERVICE',
      slug: 'edit',
      label: 'Edit',
      icon: 'ri:pencil-line',
      order: 2,
      default: false,
      color: 'blue',
    },
  ] as const satisfies ServiceSuggestionTypeInfo<ServiceSuggestionType>[]
)
