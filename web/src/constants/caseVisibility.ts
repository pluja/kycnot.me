import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'

import type { Assert } from '../lib/assert'
import type { CaseVisibility } from '@prisma/client'
import type { Equals } from 'ts-toolbelt/out/Any/Equals'

type CaseVisibilityInfo<T extends string | null | undefined = string> = {
  value: T
  slug: string
  label: string
  icon: string
  color: 'amber' | 'blue' | 'green'
  description: string
  order: number
}

export const {
  dataArray: caseVisibilities,
  dataObject: caseVisibilitiesByValue,
  getFn: getCaseVisibilityInfo,
} = makeHelpersForOptions(
  'value',
  (value): CaseVisibilityInfo<typeof value> => ({
    value,
    slug: value ? value.toLowerCase() : '',
    label: String(value),
    icon: 'ri:question-line',
    color: 'blue',
    description: '',
    order: Infinity,
  }),
  [
    {
      value: 'PUBLIC',
      slug: 'public',
      label: 'Public',
      icon: 'ri:earth-line',
      color: 'green',
      description: 'Visible to anyone viewing the published case.',
      order: 1,
    },
    {
      value: 'PARTICIPANTS',
      slug: 'participants',
      label: 'Participants',
      icon: 'ri:group-line',
      color: 'blue',
      description: 'Visible to the reporter, attached participants, the service team, and staff.',
      order: 2,
    },
    {
      value: 'STAFF',
      slug: 'staff',
      label: 'Staff only',
      icon: 'ri:shield-user-line',
      color: 'amber',
      description: 'Internal note. Only case managers can see this.',
      order: 3,
    },
  ] as const satisfies CaseVisibilityInfo<CaseVisibility>[]
)

type _ExpectToHaveAllValues = Assert<Equals<(typeof caseVisibilities)[number]['value'], CaseVisibility>>
