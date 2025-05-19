import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { EventType } from '@prisma/client'

type EventTypeInfo<T extends string | null | undefined = string> = {
  id: T
  slug: string
  label: string
  description: string
  classNames: {
    dot: string
  }
  icon: string
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
    },
    icon: 'ri:question-fill',
  }),
  [
    {
      id: 'WARNING',
      slug: 'warning',
      label: 'Warning',
      description: 'Potential issues that users should be aware of',
      classNames: {
        dot: 'bg-amber-900 text-amber-300 ring-amber-900/50',
      },
      icon: 'ri:error-warning-fill',
    },
    {
      id: 'WARNING_SOLVED',
      slug: 'warning-solved',
      label: 'Warning Solved',
      description: 'A previously reported warning has been solved',
      classNames: {
        dot: 'bg-green-900 text-green-300 ring-green-900/50',
      },
      icon: 'ri:check-fill',
    },
    {
      id: 'ALERT',
      slug: 'alert',
      label: 'Alert',
      description: 'Critical issues affecting service functionality',
      classNames: {
        dot: 'bg-red-900 text-red-300 ring-red-900/50',
      },
      icon: 'ri:alert-fill',
    },
    {
      id: 'ALERT_SOLVED',
      slug: 'alert-solved',
      label: 'Alert Solved',
      description: 'A previously reported alert has been solved',
      classNames: {
        dot: 'bg-green-900 text-green-300 ring-green-900/50',
      },
      icon: 'ri:check-fill',
    },
    {
      id: 'INFO',
      slug: 'info',
      label: 'Information',
      description: 'General information about the service',
      classNames: {
        dot: 'bg-blue-900 text-blue-300 ring-blue-900/50',
      },
      icon: 'ri:information-fill',
    },
    {
      id: 'NORMAL',
      slug: 'normal',
      label: 'Normal',
      description: 'Regular service update or announcement',
      classNames: {
        dot: 'bg-zinc-700 text-zinc-300 ring-zinc-700/50',
      },
      icon: 'ri:notification-fill',
    },
    {
      id: 'UPDATE',
      slug: 'update',
      label: 'Update',
      description: 'Service details were updated on kycnot.me',
      classNames: {
        dot: 'bg-sky-900 text-sky-300 ring-sky-900/50',
      },
      icon: 'ri:pencil-fill',
    },
  ] as const satisfies EventTypeInfo<EventType>[]
)
