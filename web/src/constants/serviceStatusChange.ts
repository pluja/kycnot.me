import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { ServiceVerificationStatusChange } from '@prisma/client'

type ServiceVerificationStatusChangeInfo<T extends string | null | undefined = string> = {
  value: T
  label: string
  notificationTitle: string
}

export const {
  dataArray: serviceVerificationStatusChanges,
  dataObject: serviceVerificationStatusChangesById,
  getFn: getServiceVerificationStatusChangeInfo,
  zodEnumById: serviceVerificationStatusChangesZodEnumById,
} = makeHelpersForOptions(
  'value',
  (value): ServiceVerificationStatusChangeInfo<typeof value> => ({
    value,
    label: value ? transformCase(value.replaceAll('_', ' '), 'title') : String(value),
    notificationTitle: value ? transformCase(value.replaceAll('_', ' '), 'title') : String(value),
  }),
  [
    {
      value: 'STATUS_CHANGED_TO_COMMUNITY_CONTRIBUTED',
      label: 'status changed to community contributed',
      notificationTitle: 'status changed to community contributed',
    },
    {
      value: 'STATUS_CHANGED_TO_APPROVED',
      label: 'status changed to approved',
      notificationTitle: 'status changed to approved',
    },
    {
      value: 'STATUS_CHANGED_TO_VERIFICATION_SUCCESS',
      label: 'status changed to verification success',
      notificationTitle: 'status changed to verification success',
    },
    {
      value: 'STATUS_CHANGED_TO_VERIFICATION_FAILED',
      label: 'status changed to verification failed',
      notificationTitle: 'status changed to verification failed',
    },
  ] as const satisfies ServiceVerificationStatusChangeInfo<ServiceVerificationStatusChange>[]
)

export type ServiceVerificationStatusChangeType = (typeof serviceVerificationStatusChanges)[number]['value']
