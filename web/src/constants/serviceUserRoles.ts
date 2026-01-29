import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { Assert } from '../lib/assert'
import type { TailwindColor } from '../lib/colors'
import type { ServiceUserRole } from '@prisma/client'
import type { Equals } from 'ts-toolbelt/out/Any/Equals'

type ServiceUserRoleInfo<T extends string | null | undefined = string> = {
  value: T
  slug: string
  label: string
  icon: string
  order: number
  color: NonNullable<TailwindColor>
}

export const {
  dataArray: serviceUserRoles,
  dataObject: serviceUserRolesById,
  getFn: getServiceUserRoleInfo,
} = makeHelpersForOptions(
  'value',
  (value): ServiceUserRoleInfo<typeof value> => ({
    value,
    slug: value ? value.toLowerCase().replace('_', '-') : '',
    label: value ? transformCase(value, 'title').replace('_', ' ') : String(value),
    icon: 'ri:user-3-line',
    order: Infinity,
    color: 'gray',
  }),
  [
    {
      value: 'OWNER',
      slug: 'owner',
      label: 'Owner',
      icon: 'ri:vip-crown-2-fill',
      order: 1,
      color: 'lime',
    },
    {
      value: 'ADMIN',
      slug: 'admin',
      label: 'Admin',
      icon: 'ri:shield-star-fill',
      order: 2,
      color: 'green',
    },
    {
      value: 'MODERATOR',
      slug: 'moderator',
      label: 'Moderator',
      icon: 'ri:graduation-cap-fill',
      order: 3,
      color: 'teal',
    },
    {
      value: 'SUPPORT',
      slug: 'support',
      label: 'Support',
      icon: 'ri:customer-service-2-fill',
      order: 4,
      color: 'blue',
    },
    {
      value: 'TEAM_MEMBER',
      slug: 'team_member',
      label: 'Team Member',
      icon: 'ri:team-fill',
      order: 5,
      color: 'cyan',
    },
  ] as const satisfies ServiceUserRoleInfo<ServiceUserRole>[]
)

type _ExpectToHaveAllValues = Assert<Equals<(typeof serviceUserRoles)[number]['value'], ServiceUserRole>>
