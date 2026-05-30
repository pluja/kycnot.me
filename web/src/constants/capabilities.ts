import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'

type CapabilityInfo<T extends string | null | undefined = string> = {
  value: T
  slug: string
  label: string
  description: string
  icon: string
}

export const {
  dataArray: capabilities,
  dataObject: capabilitiesByValue,
  getFn: getCapabilityInfo,
  zodEnumById: capabilitiesZodEnum,
} = makeHelpersForOptions(
  'value',
  (value): CapabilityInfo<typeof value> => ({
    value,
    slug: value ? value.replace(':', '-') : '',
    label: value ?? 'Unknown capability',
    description: '',
    icon: 'ri:shield-keyhole-line',
  }),
  [
    {
      value: 'cases:manage',
      slug: 'cases-manage',
      label: 'Manage cases',
      description:
        'Create, edit and resolve service cases: blocked funds, KYC demands, non-payment and similar reports.',
      icon: 'ri:scales-3-line',
    },
  ] as const,
)

export type Capability = (typeof capabilities)[number]['value']
