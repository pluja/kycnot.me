import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { ServiceVisibility } from '@prisma/client'

type ServiceVisibilityInfo<T extends string | null | undefined = string> = {
  value: T
  slug: string
  label: string
  description: string
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
    slug: value ? value.toLowerCase() : '',
    label: value ? transformCase(value, 'title') : String(value),
    description: '',
    icon: 'ri:eye-line',
    iconClass: 'text-current/60',
  }),
  [
    {
      value: 'PUBLIC',
      slug: 'public',
      label: 'Public',
      description: 'Listed in search and browse.',
      icon: 'ri:global-line',
      iconClass: 'text-green-500',
    },
    {
      value: 'UNLISTED',
      slug: 'unlisted',
      label: 'Unlisted',
      description: 'Only accessible via direct link.',
      icon: 'ri:link',
      iconClass: 'text-yellow-500',
    },
    {
      value: 'HIDDEN',
      slug: 'hidden',
      label: 'Hidden',
      description: 'Only visible to moderators.',
      icon: 'ri:lock-line',
      iconClass: 'text-red-500',
    },
  ] as const satisfies ServiceVisibilityInfo<ServiceVisibility>[]
)
