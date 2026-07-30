import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { Assert } from '../lib/assert'
import type { EventOrigin } from '@prisma/client'
import type { Equals } from 'ts-toolbelt/out/Any/Equals'

type EventOriginInfo<T extends string | null | undefined = string> = {
  id: T
  label: string
  description: string
  icon: string
  /// STAFF is the norm, so labelling it would only add noise to every row.
  showOnPublicEntries: boolean
}

export const { dataArray: eventOrigins, getFn: getEventOriginInfo } = makeHelpersForOptions(
  'id',
  (id): EventOriginInfo<typeof id> => ({
    id,
    label: id ? transformCase(id, 'title') : String(id),
    description: '',
    icon: 'ri:question-line',
    showOnPublicEntries: false,
  }),
  [
    {
      id: 'STAFF',
      label: 'Staff',
      description: 'Written by a kycnot.me moderator',
      icon: 'ri:shield-user-line',
      showOnPublicEntries: false,
    },
    {
      id: 'USER',
      label: 'Community',
      description: 'Submitted by a community member and checked by a moderator before publishing',
      icon: 'ri:group-line',
      showOnPublicEntries: true,
    },
    {
      id: 'AI',
      label: 'AI-assisted',
      description: 'Drafted by automation and checked by a moderator before publishing',
      icon: 'ri:sparkling-line',
      showOnPublicEntries: true,
    },
    {
      id: 'MONITOR',
      label: 'Auto-detected',
      description: 'Recorded automatically by our monitoring, with no moderator involved',
      icon: 'ri:radar-line',
      showOnPublicEntries: true,
    },
  ] as const satisfies EventOriginInfo<EventOrigin>[]
)

type _ExpectToHaveAllValues = Assert<Equals<(typeof eventOrigins)[number]['id'], EventOrigin>>
