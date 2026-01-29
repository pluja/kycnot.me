import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { Assert } from '../lib/assert'
import type { ServiceSuggestionStatus } from '@prisma/client'
import type { Equals } from 'ts-toolbelt/out/Any/Equals'

type ServiceSuggestionStatusInfo<T extends string | null | undefined = string> = {
  value: T
  slug: string
  label: string
  icon: string
  color: string
  default: boolean
}

export const {
  dataArray: serviceSuggestionStatuses,
  dataObject: serviceSuggestionStatusesById,
  getFn: getServiceSuggestionStatusInfo,
  getFnSlug: getServiceSuggestionStatusInfoBySlug,
  zodEnumBySlug: serviceSuggestionStatusesZodEnumBySlug,
  zodEnumById: serviceSuggestionStatusesZodEnumById,
  keyToSlug: serviceSuggestionStatusIdToSlug,
  slugToKey: serviceSuggestionStatusSlugToId,
} = makeHelpersForOptions(
  'value',
  (value): ServiceSuggestionStatusInfo<typeof value> => ({
    value,
    slug: value ? value.toLowerCase().replace('_', '-') : '',
    label: value ? transformCase(value, 'title') : String(value),
    icon: 'ri:question-line',
    color: 'gray',
    default: false,
  }),
  [
    {
      value: 'PENDING',
      slug: 'pending',
      label: 'Pending',
      icon: 'ri:time-line',
      color: 'yellow',
      default: true,
    },
    {
      value: 'UNDER_REVIEW',
      slug: 'under-review',
      label: 'Under review',
      icon: 'ri:eye-line',
      color: 'blue',
      default: false,
    },
    {
      value: 'APPROVED',
      slug: 'approved',
      label: 'Approved',
      icon: 'ri:check-line',
      color: 'green',
      default: false,
    },
    {
      value: 'REJECTED',
      slug: 'rejected',
      label: 'Rejected',
      icon: 'ri:close-line',
      color: 'red',
      default: false,
    },
    {
      value: 'WITHDRAWN',
      slug: 'withdrawn',
      label: 'Withdrawn',
      icon: 'ri:arrow-left-line',
      color: 'gray',
      default: false,
    },
  ] as const satisfies ServiceSuggestionStatusInfo<ServiceSuggestionStatus>[]
)

type _ExpectToHaveAllValues = Assert<
  Equals<(typeof serviceSuggestionStatuses)[number]['value'], ServiceSuggestionStatus>
>
