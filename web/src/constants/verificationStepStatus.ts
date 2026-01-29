import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { Assert } from '../lib/assert'
import type { TailwindColor } from '../lib/colors'
import type { VerificationStepStatus } from '@prisma/client'
import type { Equals } from 'ts-toolbelt/out/Any/Equals'

type VerificationStepStatusInfo<T extends string | null | undefined = string> = {
  value: T
  slug: string
  label: string
  icon: string
  iconClass: string
  iconSpin: boolean
  order: number
  color: TailwindColor
}

export const {
  dataArray: verificationStepStatuses,
  dataObject: verificationStepStatusesByValue,
  getFn: getVerificationStepStatusInfo,
} = makeHelpersForOptions(
  'value',
  (value): VerificationStepStatusInfo<typeof value> => ({
    value,
    slug: value ? value.toLowerCase().replace('_', '-') : '',
    label: value ? transformCase(value, 'title') : String(value),
    icon: 'ri:question-mark',
    iconClass: 'text-gray-500',
    iconSpin: false,
    order: Infinity,
    color: 'gray',
  }),
  [
    {
      value: 'PENDING',
      slug: 'pending',
      label: 'Pending',
      icon: 'ri:loader-2-line',
      iconSpin: false,
      iconClass: 'text-gray-400',
      order: 1,
      color: 'gray',
    },
    {
      value: 'IN_PROGRESS',
      slug: 'in-progress',
      label: 'In Progress',
      icon: 'ri:loader-4-line',
      iconSpin: true,
      iconClass: 'text-blue-400',
      order: 2,
      color: 'blue',
    },
    {
      value: 'PASSED',
      slug: 'passed',
      label: 'Passed',
      icon: 'ri:check-line',
      iconClass: 'text-green-400',
      iconSpin: false,
      order: 3,
      color: 'green',
    },
    {
      value: 'FAILED',
      slug: 'failed',
      label: 'Failed',
      icon: 'ri:close-line',
      iconClass: 'text-red-400',
      iconSpin: false,
      order: 4,
      color: 'red',
    },
    {
      value: 'WARNING',
      slug: 'warning',
      label: 'Warning',
      icon: 'ri:alert-line',
      iconClass: 'text-yellow-400',
      iconSpin: false,
      order: 5,
      color: 'yellow',
    },
  ] as const satisfies VerificationStepStatusInfo<VerificationStepStatus>[]
)

type _ExpectToHaveAllValues = Assert<
  Equals<(typeof verificationStepStatuses)[number]['value'], VerificationStepStatus>
>
