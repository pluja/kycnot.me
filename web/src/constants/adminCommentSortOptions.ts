import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'

import type { Comment } from '@prisma/client'

type AdminCommentSortOptionInfo<T extends string | null | undefined = string> = {
  value: T
  label: string
  icon?: string
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
  }),
  [
    {
      value: 'createdAt',
      label: 'Created',
    },
    {
      value: 'approvedAt',
      label: 'Approved',
    },
  ] as const satisfies AdminCommentSortOptionInfo<keyof Comment>[]
)

export type AdminCommentSortOption = (typeof adminCommentSortOptions)[number]['value']
