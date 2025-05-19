import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { AccountStatusChange } from '@prisma/client'

type AccountStatusChangeInfo<T extends string | null | undefined = string> = {
  value: T
  label: string
  notificationTitle: string
}

export const {
  dataArray: accountStatusChanges,
  dataObject: accountStatusChangesById,
  getFn: getAccountStatusChangeInfo,
  zodEnumById: accountStatusChangesZodEnumById,
} = makeHelpersForOptions(
  'value',
  (value): AccountStatusChangeInfo<typeof value> => ({
    value,
    label: value ? transformCase(value.replaceAll('_', ' '), 'title') : String(value),
    notificationTitle: value ? transformCase(value.replaceAll('_', ' '), 'title') : String(value),
  }),
  [
    {
      value: 'ADMIN_TRUE',
      label: 'Admin role granted',
      notificationTitle: 'Admin role granted',
    },
    {
      value: 'ADMIN_FALSE',
      label: 'Admin role revoked',
      notificationTitle: 'Admin role revoked',
    },
    {
      value: 'VERIFIED_TRUE',
      label: 'Account verified',
      notificationTitle: 'Your account is now verified',
    },
    {
      value: 'VERIFIED_FALSE',
      label: 'Account unverified',
      notificationTitle: 'Your account is no longer verified',
    },
    {
      value: 'VERIFIER_TRUE',
      label: 'Verifier role granted',
      notificationTitle: 'Verifier role granted',
    },
    {
      value: 'VERIFIER_FALSE',
      label: 'Verifier role revoked',
      notificationTitle: 'Verifier role revoked',
    },
    {
      value: 'SPAMMER_TRUE',
      label: 'Banned',
      notificationTitle: 'Your account has been banned',
    },
    {
      value: 'SPAMMER_FALSE',
      label: 'Unbanned',
      notificationTitle: 'Your account is no longer banned',
    },
  ] as const satisfies AccountStatusChangeInfo<AccountStatusChange>[]
)

export type AccountStatusChangeType = (typeof accountStatusChanges)[number]['value']
