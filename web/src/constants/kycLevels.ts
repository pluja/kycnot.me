import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { parseIntWithFallback } from '../lib/numbers'
import { transformCase } from '../lib/strings'

import type { AttributeType } from '@prisma/client'

type KycLevelInfo<T extends string | null | undefined = string> = {
  id: T
  value: number
  icon: string
  name: string
  description: string
  privacyPoints: number
  attributeType: AttributeType
}

export const {
  dataArray: kycLevels,
  dataObject: kycLevelsById,
  getFn: getKycLevelInfo,
} = makeHelpersForOptions(
  'id',
  (id): KycLevelInfo<typeof id> => ({
    id,
    value: parseIntWithFallback(id, 4),
    icon: 'diamond-question',
    name: `KYC ${id ? transformCase(id, 'title') : String(id)}`,
    description: '',
    privacyPoints: 0,
    attributeType: 'INFO',
  }),
  [
    {
      id: '0',
      value: 0,
      icon: 'anonymous-mask',
      name: 'Guaranteed no KYC',
      description: 'Terms explicitly state KYC will never be requested.',
      privacyPoints: 25,
      attributeType: 'GOOD',
    },
    {
      id: '1',
      value: 1,
      icon: 'diamond-question',
      name: 'No KYC mention',
      description: 'No mention of current or future KYC requirements.',
      privacyPoints: 15,
      attributeType: 'GOOD',
    },
    {
      id: '2',
      value: 2,
      icon: 'handcuffs',
      name: 'KYC on authorities request',
      description:
        'No routine KYC, but may cooperate with authorities, block funds or implement future KYC requirements.',
      privacyPoints: -5,
      attributeType: 'WARNING',
    },
    {
      id: '3',
      value: 3,
      icon: 'gun',
      name: 'Shotgun KYC',
      description: 'May request KYC and block funds based on automated triggers.',
      privacyPoints: -15,
      attributeType: 'WARNING',
    },
    {
      id: '4',
      value: 4,
      icon: 'fingerprint-detailed',
      name: 'Mandatory KYC',
      description: 'Required for key features and can be required arbitrarily at any time.',
      privacyPoints: -25,
      attributeType: 'BAD',
    },
  ] as const satisfies KycLevelInfo<`${number}`>[]
)
