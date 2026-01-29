import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { Assert } from '../lib/assert'
import type { ServiceVisibility } from '@prisma/client'
import type { Equals } from 'ts-toolbelt/out/Any/Equals'

type ServiceVisibilityInfo<T extends string | null | undefined = string> = {
  value: T
  slug: string
  label: string
  description: string
  longDescription: string
  icon: string
  iconClass: string
}

export const {
  dataArray: serviceVisibilities,
  dataObject: serviceVisibilitiesById,
  getFn: getServiceVisibilityInfo,
  getFnSlug: getServiceVisibilityInfoBySlug,
  zodEnumBySlug: serviceVisibilitiesZodEnumBySlug,
  zodEnumById: serviceVisibilitiesZodEnumById,
  keyToSlug: serviceVisibilityIdToSlug,
  slugToKey: serviceVisibilitySlugToId,
} = makeHelpersForOptions(
  'value',
  (value): ServiceVisibilityInfo<typeof value> => ({
    value,
    slug: value ? value.toLowerCase().replace('_', '-') : '',
    label: value ? transformCase(value, 'title') : String(value),
    description: '',
    longDescription: '',
    icon: 'ri:eye-line',
    iconClass: 'text-current/60',
  }),
  [
    {
      value: 'PUBLIC',
      slug: 'public',
      label: 'Public',
      description: 'Listed in search and browse.',
      longDescription: 'Listed in search and browse.',
      icon: 'ri:global-line',
      iconClass: 'text-green-500',
    },
    {
      value: 'UNLISTED',
      slug: 'unlisted',
      label: 'Unlisted',
      description: 'Only accessible via direct link.',
      longDescription: "Unlisted service, only accessible via direct link and won't appear in searches.",
      icon: 'ri:link',
      iconClass: 'text-yellow-500',
    },
    {
      value: 'HIDDEN',
      slug: 'hidden',
      label: 'Hidden',
      description: 'Only visible to moderators.',
      longDescription: 'Hidden service, only visible to moderators.',
      icon: 'ri:lock-line',
      iconClass: 'text-red-500',
    },
    {
      value: 'ARCHIVED',
      slug: 'archived',
      label: 'Archived',
      description: 'No longer operational.',
      longDescription:
        'Archived service, no longer exists or ceased operations. Information may be outdated.',
      icon: 'ri:archive-line',
      iconClass: 'text-day-100',
    },
  ] as const satisfies ServiceVisibilityInfo<ServiceVisibility>[]
)

type _ExpectToHaveAllValues = Assert<Equals<(typeof serviceVisibilities)[number]['value'], ServiceVisibility>>
