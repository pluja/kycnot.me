import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { ServiceSuggestionStatus } from '@prisma/client'

type ServiceSuggestionStatusInfo<T extends string | null | undefined = string> = {
  value: T
  slug: string
  label: string
  icon: string
  iconClass: string
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
    iconClass: 'text-current/60',
    default: false,
  }),
  [
    {
      value: 'PENDING',
      slug: 'pending',
      label: 'Pending',
      icon: 'ri:time-line',
      iconClass: 'text-yellow-400',
      default: true,
    },
    {
      value: 'APPROVED',
      slug: 'approved',
      label: 'Approved',
      icon: 'ri:check-line',
      iconClass: 'text-green-400',
      default: false,
    },
    {
      value: 'REJECTED',
      slug: 'rejected',
      label: 'Rejected',
      icon: 'ri:close-line',
      iconClass: 'text-red-400',
      default: false,
    },
    {
      value: 'WITHDRAWN',
      slug: 'withdrawn',
      label: 'Withdrawn',
      icon: 'ri:arrow-left-line',
      iconClass: 'text-gray-400',
      default: false,
    },
  ] as const satisfies ServiceSuggestionStatusInfo<ServiceSuggestionStatus>[]
)
