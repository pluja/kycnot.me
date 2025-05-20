import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { AnnouncementType } from '@prisma/client'

type AnnouncementTypeInfo<T extends string | null | undefined = string> = {
  value: T
  label: string
  icon: string
  classNames: {
    container: string
    bg: string
    content: string
    icon: string
    badge: string
  }
}
export const {
  dataArray: announcementTypes,
  dataObject: announcementTypesById,
  getFn: getAnnouncementTypeInfo,
  zodEnumById: zodAnnouncementTypesById,
} = makeHelpersForOptions(
  'value',
  (value): AnnouncementTypeInfo<typeof value> => ({
    value,
    label: value ? transformCase(value.replaceAll('_', ' '), 'title') : String(value),
    icon: 'ri:information-fill',
    classNames: {
      container: 'bg-blue-950',
      bg: 'from-blue-400 to-blue-700',
      content: '[--gradient-edge:var(--color-blue-100)] [--gradient-center:var(--color-blue-200)]',
      icon: 'text-blue-400/80',
      badge: 'bg-blue-900/30 text-blue-400',
    },
  }),
  [
    {
      value: 'INFO',
      label: 'Info',
      icon: 'ri:information-fill',
      classNames: {
        container: 'bg-green-950',
        bg: 'from-green-400 to-green-700',
        content: '[--gradient-edge:var(--color-green-100)] [--gradient-center:var(--color-lime-200)]',
        icon: 'text-green-400/80',
        badge: 'bg-blue-900/30 text-blue-400',
      },
    },
    {
      value: 'WARNING',
      label: 'Warning',
      icon: 'ri:alert-fill',
      classNames: {
        container: 'bg-yellow-950',
        bg: 'from-yellow-400 to-yellow-700',
        content: '[--gradient-edge:var(--color-yellow-100)] [--gradient-center:var(--color-amber-200)]',
        icon: 'text-yellow-400/80',
        badge: 'bg-yellow-900/30 text-yellow-400',
      },
    },
    {
      value: 'ALERT',
      label: 'Alert',
      icon: 'ri:spam-fill',
      classNames: {
        container: 'bg-red-950',
        bg: 'from-red-400 to-red-700',
        content: '[--gradient-edge:var(--color-red-100)] [--gradient-center:var(--color-rose-200)]',
        icon: 'text-red-400/80',
        badge: 'bg-red-900/30 text-red-400',
      },
    },
  ] as const satisfies AnnouncementTypeInfo<AnnouncementType>[]
)
