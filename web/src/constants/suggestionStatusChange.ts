import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { ServiceSuggestionStatusChange } from '@prisma/client'

type ServiceSuggestionStatusChangeInfo<T extends string | null | undefined = string> = {
  value: T
  label: string
  notificationTitle: string
}

export const {
  dataArray: serviceSuggestionStatusChanges,
  dataObject: serviceSuggestionStatusChangesById,
  getFn: getServiceSuggestionStatusChangeInfo,
  zodEnumById: serviceSuggestionStatusChangesZodEnumById,
} = makeHelpersForOptions(
  'value',
  (value): ServiceSuggestionStatusChangeInfo<typeof value> => ({
    value,
    label: value ? transformCase(value.replaceAll('_', ' '), 'title') : String(value),
    notificationTitle: value ? transformCase(value.replaceAll('_', ' '), 'title') : String(value),
  }),
  [
    {
      value: 'STATUS_CHANGED_TO_PENDING',
      label: 'status changed to pending',
      notificationTitle: 'status changed to pending',
    },
    {
      value: 'STATUS_CHANGED_TO_APPROVED',
      label: 'status changed to approved',
      notificationTitle: 'status changed to approved',
    },
    {
      value: 'STATUS_CHANGED_TO_REJECTED',
      label: 'status changed to rejected',
      notificationTitle: 'status changed to rejected',
    },
    {
      value: 'STATUS_CHANGED_TO_WITHDRAWN',
      label: 'status changed to withdrawn',
      notificationTitle: 'status changed to withdrawn',
    },
  ] as const satisfies ServiceSuggestionStatusChangeInfo<ServiceSuggestionStatusChange>[]
)

export type ServiceSuggestionStatusChangeType = (typeof serviceSuggestionStatusChanges)[number]['value']
