import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { AnnouncementType } from '@prisma/client'

type AnnouncementTypeInfo<T extends string | null | undefined = string> = {
  value: T
  label: string
  icon: string
  classNames: {
    container: string
    title: string
    content: string
  }
}

export const {
  dataArray: announcementTypes,
  dataObject: announcementTypesById,
  getFn: getAnnouncementTypeInfo,
} = makeHelpersForOptions(
  'value',
  (value): AnnouncementTypeInfo<typeof value> => ({
    value,
    label: value ? transformCase(value.replaceAll('_', ' '), 'title') : String(value),
    icon: 'ri:information-line',
    classNames: {
      container: 'bg-blue-900/40 border-blue-500/30',
      title: 'text-blue-400',
      content: 'text-blue-300',
    },
  }),
  [
    {
      value: 'INFO',
      label: 'Info',
      icon: 'ri:information-line',
      classNames: {
        container: 'bg-blue-900/40 border-blue-500/30',
        title: 'text-blue-400',
        content: 'text-blue-300',
      },
    },
    {
      value: 'WARNING',
      label: 'Warning',
      icon: 'ri:alert-line',
      classNames: {
        container: 'bg-yellow-900/40 border-yellow-500/30',
        title: 'text-yellow-400',
        content: 'text-yellow-300',
      },
    },
    {
      value: 'ALERT',
      label: 'Alert',
      icon: 'ri:error-warning-line',
      classNames: {
        container: 'bg-red-900/40 border-red-500/30',
        title: 'text-red-400',
        content: 'text-red-300',
      },
    },
  ] as const satisfies AnnouncementTypeInfo<AnnouncementType>[]
)
