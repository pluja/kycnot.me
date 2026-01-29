import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { Assert } from '../lib/assert'
import type { AccountStatusChange } from '@prisma/client'
import type { Equals } from 'ts-toolbelt/out/Any/Equals'

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
      value: 'MODERATOR_TRUE',
      label: 'Moderator role granted',
      notificationTitle: 'Moderator role granted',
    },
    {
      value: 'MODERATOR_FALSE',
      label: 'Moderator role revoked',
      notificationTitle: 'Moderator role revoked',
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

type _ExpectToHaveAllValues = Assert<
  Equals<(typeof accountStatusChanges)[number]['value'], AccountStatusChange>
>
