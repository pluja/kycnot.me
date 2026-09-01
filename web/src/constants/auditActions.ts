import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { Assert } from '../lib/assert'
import type { AuditAction } from '@prisma/client'
import type { Equals } from 'ts-toolbelt/out/Any/Equals'

type AuditActionInfo<T extends string | null | undefined = string> = {
  id: T
  icon: string
  name: string
  classNames: { icon: string }
  order: number
}

export const {
  dataArray: auditActions,
  dataObject: auditActionsById,
  getFn: getAuditActionInfo,
} = makeHelpersForOptions(
  'id',
  (id): AuditActionInfo<typeof id> => ({
    id,
    icon: 'ri:history-line',
    name: typeof id === 'string' ? transformCase(id.replace('_', ' '), 'title') : String(id),
    classNames: { icon: 'text-day-400' },
    order: Infinity,
  }),
  [
    { id: 'CREATED', icon: 'ri:add-line', name: 'Created', classNames: { icon: 'text-green-400' }, order: 1 },
    { id: 'UPDATED', icon: 'ri:edit-line', name: 'Updated', classNames: { icon: 'text-blue-400' }, order: 2 },
    {
      id: 'STATUS_CHANGED',
      icon: 'ri:exchange-line',
      name: 'Status changed',
      classNames: { icon: 'text-yellow-400' },
      order: 3,
    },
    {
      id: 'DELETED',
      icon: 'ri:delete-bin-line',
      name: 'Deleted',
      classNames: { icon: 'text-red-400' },
      order: 4,
    },
  ] as const satisfies AuditActionInfo<AuditAction>[]
)

type _ExpectToHaveAllValues = Assert<Equals<(typeof auditActions)[number]['id'], AuditAction>>
