import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { Assert } from '../lib/assert'
import type { CommentStatusChange } from '@prisma/client'
import type { Equals } from 'ts-toolbelt/out/Any/Equals'

type CommentStatusChangeInfo<T extends string | null | undefined = string> = {
  value: T
  label: string
  notificationTitle: string
}

export const {
  dataArray: commentStatusChanges,
  dataObject: commentStatusChangesById,
  getFn: getCommentStatusChangeInfo,
  zodEnumById: commentStatusChangesZodEnumById,
} = makeHelpersForOptions(
  'value',
  (value): CommentStatusChangeInfo<typeof value> => ({
    value,
    label: value ? transformCase(value.replaceAll('_', ' '), 'title') : String(value),
    notificationTitle: value ? transformCase(value.replaceAll('_', ' '), 'title') : String(value),
  }),
  [
    {
      value: 'MARKED_AS_SPAM',
      label: 'Marked as spam',
      notificationTitle: 'was marked as spam',
    },
    {
      value: 'UNMARKED_AS_SPAM',
      label: 'Unmarked as spam',
      notificationTitle: 'is no longer marked as spam',
    },
    {
      value: 'MARKED_FOR_ADMIN_REVIEW',
      label: 'Marked for admin review',
      notificationTitle: 'was marked for admin review',
    },
    {
      value: 'UNMARKED_FOR_ADMIN_REVIEW',
      label: 'Unmarked for admin review',
      notificationTitle: 'is no longer marked for admin review',
    },
    {
      value: 'STATUS_CHANGED_TO_APPROVED',
      label: 'Approved',
      notificationTitle: 'was approved',
    },
    {
      value: 'STATUS_CHANGED_TO_VERIFIED',
      label: 'Verified',
      notificationTitle: 'was verified',
    },
    {
      value: 'STATUS_CHANGED_TO_REJECTED',
      label: 'Rejected',
      notificationTitle: 'was rejected',
    },
    {
      value: 'STATUS_CHANGED_TO_PENDING',
      label: 'Pending',
      notificationTitle: 'is now pending',
    },
  ] as const satisfies CommentStatusChangeInfo<CommentStatusChange>[]
)

export type CommentStatusChangeType = (typeof commentStatusChanges)[number]['value']

type _ExpectToHaveAllValues = Assert<
  Equals<(typeof commentStatusChanges)[number]['value'], CommentStatusChange>
>
