import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { ServiceSuggestionStatus } from '@prisma/client'

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
    slug: value ? value.toLowerCase() : '',
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
