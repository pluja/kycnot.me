import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { TailwindColor } from '../lib/colors'
import type { VerificationStepStatus } from '@prisma/client'

type VerificationStepStatusInfo<T extends string | null | undefined = string> = {
  value: T
  label: string
  icon: string
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
    label: value ? transformCase(value, 'title') : String(value),
    icon: 'ri:question-line',
    color: 'gray',
  }),
  [
    {
      value: 'PASSED',
      label: 'Passed',
      icon: 'ri:verified-badge-fill',
      color: 'green',
    },
    {
      value: 'IN_PROGRESS',
      label: 'In Progress',
      icon: 'ri:loader-line',
      color: 'yellow',
    },
    {
      value: 'FAILED',
      label: 'Failed',
      icon: 'ri:alert-line',
      color: 'red',
    },
    {
      value: 'PENDING',
      label: 'Pending',
      icon: 'ri:time-line',
      color: 'sky',
    },
  ] as const satisfies VerificationStepStatusInfo<VerificationStepStatus>[]
)
