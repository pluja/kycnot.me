import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { Assert } from '../lib/assert'
import type { Equals } from 'ts-toolbelt/out/Any/Equals'

type TosHighlightTopicId = NonNullable<PrismaJson.TosReview['highlights'][number]['topic']>

type TosHighlightTopicInfo<T extends string | null | undefined = string> = {
  id: T
  icon: string
  name: string
  order: number
}

export const {
  dataArray: tosHighlightTopics,
  dataObject: tosHighlightTopicsById,
  getFn: getTosHighlightTopicInfo,
} = makeHelpersForOptions(
  'id',
  (id): TosHighlightTopicInfo<typeof id> => ({
    id,
    icon: 'ri:file-list-line',
    name: typeof id === 'string' ? transformCase(id, 'title') : String(id),
    order: Infinity,
  }),
  [
    // Ordered by what a privacy-conscious reader checks first.
    { id: 'verification', icon: 'ri:id-card-line', name: 'Identity checks', order: 1 },
    { id: 'fundBlocking', icon: 'ri:lock-line', name: 'Fund blocking', order: 2 },
    { id: 'custody', icon: 'ri:safe-line', name: 'Custody', order: 3 },
    { id: 'dataSharing', icon: 'ri:share-forward-line', name: 'Data sharing', order: 4 },
    { id: 'logging', icon: 'ri:database-2-line', name: 'Logging', order: 5 },
    { id: 'jurisdiction', icon: 'ri:scales-3-line', name: 'Jurisdiction', order: 6 },
    { id: 'refunds', icon: 'ri:refund-2-line', name: 'Refunds', order: 7 },
    { id: 'disputes', icon: 'ri:auction-line', name: 'Disputes', order: 8 },
    { id: 'other', icon: 'ri:file-list-line', name: 'Other', order: 9 },
  ] as const satisfies TosHighlightTopicInfo<TosHighlightTopicId>[]
)

type _ExpectToHaveAllValues = Assert<Equals<(typeof tosHighlightTopics)[number]['id'], TosHighlightTopicId>>
