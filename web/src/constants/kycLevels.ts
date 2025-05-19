import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { parseIntWithFallback } from '../lib/numbers'
import { transformCase } from '../lib/strings'

type KycLevelInfo<T extends string | null | undefined = string> = {
  id: T
  value: number
  icon: string
  name: string
  description: string
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
  }),
  [
    {
      id: '0',
      value: 0,
      icon: 'anonymous-mask',
      name: 'Guaranteed no KYC',
      description: 'Terms explicitly state KYC will never be requested.',
    },
    {
      id: '1',
      value: 1,
      icon: 'diamond-question',
      name: 'No KYC mention',
      description: 'No mention of current or future KYC requirements.',
    },
    {
      id: '2',
      value: 2,
      icon: 'handcuffs',
      name: 'KYC on authorities request',
      description:
        'No routine KYC, but may cooperate with authorities, block funds or implement future KYC requirements.',
    },
    {
      id: '3',
      value: 3,
      icon: 'gun',
      name: 'Shotgun KYC',
      description: 'May request KYC and block funds based on automated triggers.',
    },
    {
      id: '4',
      value: 4,
      icon: 'fingerprint-detailed',
      name: 'Mandatory KYC',
      description: 'Required for key features and can be required arbitrarily at any time.',
    },
  ] as const satisfies KycLevelInfo<'0' | '1' | '2' | '3' | '4'>[]
)
