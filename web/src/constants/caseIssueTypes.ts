import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { Assert } from '../lib/assert'
import type { CaseIssueType } from '@prisma/client'
import type { Equals } from 'ts-toolbelt/out/Any/Equals'

type CaseIssueTypeInfo<T extends string | null | undefined = string> = {
  value: T
  slug: string
  label: string
  icon: string
}

export const {
  dataArray: caseIssueTypes,
  dataObject: caseIssueTypesByValue,
  getFn: getCaseIssueTypeInfo,
} = makeHelpersForOptions(
  'value',
  (value): CaseIssueTypeInfo<typeof value> => ({
    value,
    slug: value ? value.toLowerCase().replace(/_/g, '-') : '',
    label: value ? transformCase(value.replace(/_/g, ' '), 'title') : String(value),
    icon: 'ri:question-line',
  }),
  [
    { value: 'NON_PAYMENT', slug: 'non-payment', label: 'Non-payment', icon: 'ri:hand-coin-line' },
    { value: 'FROZEN_FUNDS', slug: 'frozen-funds', label: 'Frozen funds', icon: 'ri:lock-2-line' },
    { value: 'KYC_DEMAND', slug: 'kyc-demand', label: 'KYC demand', icon: 'ri:id-card-line' },
    { value: 'ACCOUNT_CLOSURE', slug: 'account-closure', label: 'Account closure', icon: 'ri:logout-box-line' },
    {
      value: 'UNRESPONSIVE_SUPPORT',
      slug: 'unresponsive-support',
      label: 'Unresponsive support',
      icon: 'ri:customer-service-2-line',
    },
    { value: 'OTHER', slug: 'other', label: 'Other', icon: 'ri:more-line' },
  ] as const satisfies CaseIssueTypeInfo<CaseIssueType>[]
)

type _ExpectToHaveAllValues = Assert<Equals<(typeof caseIssueTypes)[number]['value'], CaseIssueType>>
