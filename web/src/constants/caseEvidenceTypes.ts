import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { Assert } from '../lib/assert'
import type { CaseEvidenceType } from '@prisma/client'
import type { Equals } from 'ts-toolbelt/out/Any/Equals'

type CaseEvidenceTypeInfo<T extends string | null | undefined = string> = {
  value: T
  slug: string
  label: string
  icon: string
}

export const {
  dataArray: caseEvidenceTypes,
  dataObject: caseEvidenceTypesByValue,
  getFn: getCaseEvidenceTypeInfo,
} = makeHelpersForOptions(
  'value',
  (value): CaseEvidenceTypeInfo<typeof value> => ({
    value,
    slug: value ? value.toLowerCase().replace(/_/g, '-') : '',
    label: value ? transformCase(value.replace(/_/g, ' '), 'title') : String(value),
    icon: 'ri:attachment-2',
  }),
  [
    {
      value: 'LETTER_OF_GUARANTEE',
      slug: 'letter-of-guarantee',
      label: 'Letter of Guarantee',
      icon: 'ri:file-shield-2-line',
    },
    { value: 'TRANSACTION_ID', slug: 'transaction-id', label: 'Transaction ID', icon: 'ri:exchange-funds-line' },
    { value: 'COMMUNICATION_LOG', slug: 'communication-log', label: 'Communication log', icon: 'ri:chat-3-line' },
    { value: 'SCREENSHOT', slug: 'screenshot', label: 'Screenshot', icon: 'ri:image-line' },
    { value: 'OTHER', slug: 'other', label: 'Other', icon: 'ri:attachment-2' },
  ] as const satisfies CaseEvidenceTypeInfo<CaseEvidenceType>[]
)

type _ExpectToHaveAllValues = Assert<Equals<(typeof caseEvidenceTypes)[number]['value'], CaseEvidenceType>>
