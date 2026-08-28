import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { Assert } from '../lib/assert'
import type { LegalDocumentKind } from '@prisma/client'
import type { Equals } from 'ts-toolbelt/out/Any/Equals'

type LegalDocumentKindInfo<T extends string | null | undefined = string> = {
  id: T
  icon: string
  name: string
  order: number
}

export const {
  dataArray: legalDocumentKinds,
  dataObject: legalDocumentKindsById,
  getFn: getLegalDocumentKindInfo,
} = makeHelpersForOptions(
  'id',
  (id): LegalDocumentKindInfo<typeof id> => ({
    id,
    icon: 'ri:file-text-line',
    name: typeof id === 'string' ? transformCase(id, 'title') : String(id),
    order: Infinity,
  }),
  [
    { id: 'TERMS', icon: 'ri:file-text-line', name: 'Terms of Service', order: 1 },
    { id: 'PRIVACY', icon: 'ri:shield-user-line', name: 'Privacy Policy', order: 2 },
    { id: 'AML', icon: 'ri:scan-line', name: 'AML Policy', order: 3 },
    { id: 'REFUND', icon: 'ri:refund-2-line', name: 'Refund Policy', order: 4 },
    { id: 'OTHER', icon: 'ri:file-list-line', name: 'Other document', order: 5 },
  ] as const satisfies LegalDocumentKindInfo<LegalDocumentKind>[]
)

type _ExpectToHaveAllValues = Assert<Equals<(typeof legalDocumentKinds)[number]['id'], LegalDocumentKind>>
