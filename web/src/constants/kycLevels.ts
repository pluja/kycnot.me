import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { parseIntWithFallback } from '../lib/numbers'
import { transformCase } from '../lib/strings'

import type { AttributeType } from '@prisma/client'

type KycLevelInfo<T extends string | null | undefined = string> = {
  id: T
  value: number
  icon: string
  name: string
  shortName: string
  description: string
  privacyPoints: number
  attributeType: AttributeType
  badgeClassName: string
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
    shortName: '?',
    description: '',
    privacyPoints: 0,
    attributeType: 'INFO',
    badgeClassName: 'bg-blue-500/20 text-blue-300',
  }),
  [
    {
      id: '0',
      value: 0,
      icon: 'anonymous-mask',
      name: 'Guaranteed no KYC',
      shortName: 'Never',
      description: 'Terms explicitly state KYC will never be requested.',
      privacyPoints: 25,
      attributeType: 'GOOD',
      badgeClassName: 'bg-green-500/20 text-green-300',
    },
    {
      id: '1',
      value: 1,
      icon: 'diamond-question',
      name: 'No KYC mention',
      shortName: 'Unstated',
      description: 'No mention of current or future KYC requirements.',
      privacyPoints: 10, // keep in sync with kyc_factor in prisma/triggers/02_service_score.sql
      attributeType: 'GOOD',
      badgeClassName: 'bg-zinc-500/20 text-zinc-300',
    },
    {
      id: '2',
      value: 2,
      icon: 'handcuffs',
      name: 'Rare KYC',
      shortName: 'Rare',
      description:
        'No routine KYC, but may request it or block funds if compelled by authorities, legal orders, or internal risk review. Refunds are subject to policies.',
      privacyPoints: -5,
      attributeType: 'WARNING',
      badgeClassName: 'bg-lime-500/20 text-lime-300',
    },
    {
      id: '3',
      value: 3,
      icon: 'gun',
      name: 'Shotgun KYC',
      shortName: 'Shotgun',
      description:
        'May request KYC or block funds mid-flow, typically via AML checks, transaction limits, or liquidity partner rules. Refunds are subject to policies.',
      privacyPoints: -15,
      attributeType: 'WARNING',
      badgeClassName: 'bg-yellow-500/20 text-yellow-300',
    },
    {
      id: '4',
      value: 4,
      icon: 'fingerprint-detailed',
      name: 'Mandatory KYC',
      shortName: 'Mandatory',
      description: 'Required for key features, and may be required arbitrarily at any time.',
      privacyPoints: -25,
      attributeType: 'BAD',
      badgeClassName: 'bg-red-500/20 text-red-300',
    },
  ] as const satisfies KycLevelInfo<`${number}`>[]
)
