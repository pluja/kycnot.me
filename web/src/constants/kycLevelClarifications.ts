import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { Assert } from '../lib/assert'
import type { AttributeType, KycLevelClarification } from '@prisma/client'
import type { Equals } from 'ts-toolbelt/out/Any/Equals'

type KycLevelClarificationInfo<T extends string | null | undefined = string> = {
  value: T
  slug: string
  label: string
  description: string
  icon: string
  privacyPoints: number
  attributeType: AttributeType
}

export const {
  dataArray: kycLevelClarifications,
  dataObject: kycLevelClarificationsById,
  getFn: getKycLevelClarificationInfo,
} = makeHelpersForOptions(
  'value',
  (value): KycLevelClarificationInfo<typeof value> => ({
    value,
    slug: value ? value.toLowerCase().replace('_', '-') : '',
    label: value ? transformCase(value.replace('_', ' '), 'title') : String(value),
    description: '',
    icon: 'ri:question-line',
    privacyPoints: 0,
    attributeType: 'INFO',
  }),
  [
    {
      value: 'NONE',
      slug: 'none',
      label: 'None',
      description: 'No clarification needed.',
      icon: 'ri:file-copy-line',
      privacyPoints: 0,
      attributeType: 'INFO',
    },
    {
      value: 'DEPENDS_ON_PARTNERS',
      slug: 'depends-on-partners',
      label: 'Depends on partners',
      description: 'May vary across partners.',
      icon: 'ri:share-forward-line',
      privacyPoints: -5,
      attributeType: 'WARNING',
    },
  ] as const satisfies KycLevelClarificationInfo<KycLevelClarification>[]
)

type _ExpectToHaveAllValues = Assert<
  Equals<(typeof kycLevelClarifications)[number]['value'], KycLevelClarification>
>
