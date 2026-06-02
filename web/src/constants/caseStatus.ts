import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { Assert } from '../lib/assert'
import type { CaseStatus } from '@prisma/client'
import type { Equals } from 'ts-toolbelt/out/Any/Equals'

type CaseStatusInfo<T extends string | null | undefined = string> = {
  value: T
  slug: string
  label: string
  icon: string
  color: string
  /** Whether the case is publicly visible at this status (Phase 3 surfaces it). */
  public: boolean
  default: boolean
}

export const {
  dataArray: caseStatuses,
  dataObject: caseStatusesByValue,
  getFn: getCaseStatusInfo,
  zodEnumById: caseStatusesZodEnum,
} = makeHelpersForOptions(
  'value',
  (value): CaseStatusInfo<typeof value> => ({
    value,
    slug: value ? value.toLowerCase().replace(/_/g, '-') : '',
    label: value ? transformCase(value.replace(/_/g, ' '), 'title') : String(value),
    icon: 'ri:question-line',
    color: 'gray',
    public: false,
    default: false,
  }),
  [
    {
      value: 'DRAFT',
      slug: 'draft',
      label: 'Draft',
      icon: 'ri:draft-line',
      color: 'gray',
      public: false,
      default: true,
    },
    {
      value: 'OPEN',
      slug: 'open',
      label: 'Open',
      icon: 'ri:error-warning-line',
      color: 'amber',
      public: true,
      default: false,
    },
    {
      value: 'RESOLVED',
      slug: 'resolved',
      label: 'Resolved',
      icon: 'ri:checkbox-circle-line',
      color: 'green',
      public: true,
      default: false,
    },
    {
      value: 'DISPUTED',
      slug: 'disputed',
      label: 'Disputed',
      icon: 'ri:scales-3-line',
      color: 'orange',
      public: true,
      default: false,
    },
    {
      value: 'REJECTED',
      slug: 'rejected',
      label: 'Rejected',
      icon: 'ri:close-circle-line',
      color: 'red',
      public: false,
      default: false,
    },
  ] as const satisfies CaseStatusInfo<CaseStatus>[]
)

type _ExpectToHaveAllValues = Assert<Equals<(typeof caseStatuses)[number]['value'], CaseStatus>>
