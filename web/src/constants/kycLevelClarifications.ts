import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { KycLevelClarification } from '@prisma/client'

type KycLevelClarificationInfo<T extends string | null | undefined = string> = {
  value: T
  label: string
  description: string
  icon: string
}

export const {
  dataArray: kycLevelClarifications,
  dataObject: kycLevelClarificationsById,
  getFn: getKycLevelClarificationInfo,
} = makeHelpersForOptions(
  'value',
  (value): KycLevelClarificationInfo<typeof value> => ({
    value,
    label: value ? transformCase(value.replace('_', ' '), 'title') : String(value),
    description: '',
    icon: 'ri:question-line',
  }),
  [
    {
      value: 'NONE',
      label: 'None',
      description: 'No clarification needed.',
      icon: 'ri:file-copy-line',
    },
    {
      value: 'DEPENDS_ON_PARTNERS',
      label: 'Depends on partners',
      description: 'May vary across partners.',
      icon: 'ri:share-forward-line',
    },
  ] as const satisfies KycLevelClarificationInfo<KycLevelClarification>[]
)
