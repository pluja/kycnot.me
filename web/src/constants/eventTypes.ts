import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { Assert } from '../lib/assert'
import type { TailwindColor } from '../lib/colors'
import type { EventType } from '@prisma/client'
import type { Equals } from 'ts-toolbelt/out/Any/Equals'

type EventTypeInfo<T extends string | null | undefined = string> = {
  id: T
  slug: string
  label: string
  description: string
  classNames: {
    dot: string
    banner?: string
  }
  icon: string
  color: TailwindColor
  isSolved: boolean
  showBanner: boolean
}

export const {
  dataArray: eventTypes,
  dataObject: eventTypesById,
  getFn: getEventTypeInfo,
  getFnSlug: getEventTypeInfoBySlug,
  zodEnumBySlug: eventTypesZodEnumBySlug,
  zodEnumById: eventTypesZodEnumById,
} = makeHelpersForOptions(
  'id',
  (id): EventTypeInfo<typeof id> => ({
    id,
    slug: id ? id.toLowerCase() : '',
    label: id ? transformCase(id, 'title') : String(id),
    description: '',
    classNames: {
      dot: 'bg-zinc-700 text-zinc-300 ring-zinc-700/50',
      banner: 'bg-zinc-900/50 text-zinc-300 hover:bg-zinc-800/60 focus-visible:bg-zinc-800/60',
    },
    icon: 'ri:question-fill',
    color: 'gray',
    isSolved: false,
    showBanner: false,
  }),
  [
    {
      id: 'WARNING',
      slug: 'warning',
      label: 'Warning',
      description: 'Potential issues that users should be aware of',
      classNames: {
        dot: 'bg-amber-900 text-amber-300 ring-amber-900/50',
        banner: 'bg-yellow-900/50 text-yellow-300 hover:bg-yellow-800/60 focus-visible:bg-yellow-800/60',
      },
      icon: 'ri:alert-fill',
      color: 'yellow',
      isSolved: false,
      showBanner: true,
    },
    {
      id: 'WARNING_SOLVED',
      slug: 'warning-solved',
      label: 'Warning Solved',
      description: 'A previously reported warning has been solved',
      classNames: {
        dot: 'bg-amber-900 text-amber-300 ring-amber-900/50',
        banner: 'bg-yellow-900/50 text-yellow-300 hover:bg-yellow-800/60 focus-visible:bg-yellow-800/60',
      },
      icon: 'ri:alert-fill',
      color: 'green',
      isSolved: true,
      showBanner: false,
    },
    {
      id: 'ALERT',
      slug: 'alert',
      label: 'Alert',
      description: 'Critical issues affecting service functionality',
      classNames: {
        dot: 'bg-red-900 text-red-300 ring-red-900/50',
        banner: 'bg-red-900/50 text-red-300 hover:bg-red-800/60 focus-visible:bg-red-800/60',
      },
      icon: 'ri:spam-fill',
      color: 'red',
      isSolved: false,
      showBanner: true,
    },
    {
      id: 'ALERT_SOLVED',
      slug: 'alert-solved',
      label: 'Alert Solved',
      description: 'A previously reported alert has been solved',
      classNames: {
        dot: 'bg-red-900 text-red-300 ring-red-900/50',
        banner: 'bg-red-900/50 text-red-300 hover:bg-red-800/60 focus-visible:bg-red-800/60',
      },
      icon: 'ri:spam-fill',
      color: 'green',
      isSolved: true,
      showBanner: false,
    },
    {
      id: 'INFO',
      slug: 'info',
      label: 'Information',
      description: 'General information about the service',
      classNames: {
        dot: 'bg-blue-900 text-blue-300 ring-blue-900/50',
        banner: 'bg-blue-900/50 text-blue-300 hover:bg-blue-800/60 focus-visible:bg-blue-800/60',
      },
      icon: 'ri:information-fill',
      color: 'sky',
      isSolved: false,
      showBanner: false,
    },
    {
      id: 'NORMAL',
      slug: 'normal',
      label: 'Normal',
      description: 'Regular service update or announcement',
      classNames: {
        dot: 'bg-zinc-700 text-zinc-300 ring-zinc-700/50',
        banner: 'bg-zinc-900/50 text-zinc-300 hover:bg-zinc-800/60 focus-visible:bg-zinc-800/60',
      },
      icon: 'ri:notification-fill',
      color: 'green',
      isSolved: false,
      showBanner: false,
    },
    {
      id: 'UPDATE',
      slug: 'update',
      label: 'Update',
      description: 'Service details were updated on kycnot.me',
      classNames: {
        dot: 'bg-sky-900 text-sky-300 ring-sky-900/50',
        banner: 'bg-sky-900/50 text-sky-300 hover:bg-sky-800/60 focus-visible:bg-sky-800/60',
      },
      icon: 'ri:pencil-fill',
      color: 'sky',
      isSolved: false,
      showBanner: false,
    },
  ] as const satisfies EventTypeInfo<EventType>[]
)

type _ExpectToHaveAllValues = Assert<Equals<(typeof eventTypes)[number]['id'], EventType>>
