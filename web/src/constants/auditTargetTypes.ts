import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { Assert } from '../lib/assert'
import type { AuditTargetType } from '@prisma/client'
import type { Equals } from 'ts-toolbelt/out/Any/Equals'

type AuditTargetTypeInfo<T extends string | null | undefined = string> = {
  id: T
  slug: string
  label: string
  icon: string
  /** Admin page for one target by id, or null when the page needs more than the id. */
  href: ((id: number) => string) | null
}

export const {
  dataArray: auditTargetTypes,
  dataObject: auditTargetTypesById,
  getFn: getAuditTargetTypeInfo,
  zodEnumBySlug: auditTargetTypesZodEnumBySlug,
  slugToKey: auditTargetTypeSlugToId,
} = makeHelpersForOptions(
  'id',
  (id): AuditTargetTypeInfo<typeof id> => ({
    id,
    slug: typeof id === 'string' ? id.toLowerCase().replace(/_/g, '-') : '',
    label: typeof id === 'string' ? transformCase(id.replace(/_/g, ' '), 'title') : String(id),
    icon: 'ri:question-line',
    href: null,
  }),
  [
    { id: 'SERVICE', slug: 'service', label: 'Service', icon: 'ri:box-3-line', href: null },
    {
      id: 'SERVICE_SUGGESTION',
      slug: 'suggestion',
      label: 'Suggestion',
      icon: 'ri:lightbulb-line',
      href: (id) => `/admin/service-suggestions/${String(id)}`,
    },
    { id: 'USER', slug: 'user', label: 'User', icon: 'ri:user-line', href: null },
    { id: 'COMMENT', slug: 'comment', label: 'Comment', icon: 'ri:chat-3-line', href: null },
    {
      id: 'CASE',
      slug: 'case',
      label: 'Case',
      icon: 'ri:scales-3-line',
      href: (id) => `/admin/cases/${String(id)}`,
    },
  ] as const satisfies AuditTargetTypeInfo<AuditTargetType>[]
)

type _ExpectToHaveAllValues = Assert<Equals<(typeof auditTargetTypes)[number]['id'], AuditTargetType>>
