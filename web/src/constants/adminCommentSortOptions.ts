import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'

import type { Comment } from '@prisma/client'

type AdminCommentSortOptionInfo<T extends string | null | undefined = string> = {
  value: T
  label: string
  hasNulls: T extends keyof Comment ? HasNull<Comment[T]> : boolean
}

export const {
  dataArray: adminCommentSortOptions,
  dataObject: adminCommentSortOptionsById,
  getFn: getAdminCommentSortOptionInfo,
  zodEnumById: adminCommentSortOptionsZodEnum,
} = makeHelpersForOptions(
  'value',
  (value): AdminCommentSortOptionInfo<typeof value> => ({
    value,
    label: String(value),
    hasNulls: false,
  }),
  [
    {
      value: 'createdAt',
      label: 'Created',
      hasNulls: false satisfies HasNull<Comment['createdAt']>,
    },
    {
      value: 'updatedAt',
      label: 'Modified',
      hasNulls: false satisfies HasNull<Comment['updatedAt']>,
    },
    {
      value: 'approvedAt',
      label: 'Approved',
      hasNulls: true satisfies HasNull<Comment['approvedAt']>,
    },
    {
      value: 'aiBrigadeConfidence',
      label: 'Brigade conf.',
      hasNulls: true satisfies HasNull<Comment['aiBrigadeConfidence']>,
    },
    {
      value: 'aiQuality',
      label: 'AI quality',
      hasNulls: true satisfies HasNull<Comment['aiQuality']>,
    },
    {
      value: 'aiDecidedAt',
      label: 'AI decided',
      hasNulls: true satisfies HasNull<Comment['aiDecidedAt']>,
    },
  ] as const satisfies AdminCommentSortOptionInfo<keyof Comment>[]
)

export type AdminCommentSortOption = (typeof adminCommentSortOptions)[number]['value']

type HasNull<T> = [null] extends [T] ? true : false
