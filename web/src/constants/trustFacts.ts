import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'

import type { TrustFact } from './trustUnlocks'
import type { Assert } from '../lib/assert'
import type { Equals } from 'ts-toolbelt/out/Any/Equals'

type TrustFactInfo<T extends string | null | undefined = string> = {
  id: T
  label: string
  icon: string
  one: string
  many: string
}

export const { dataArray: trustFacts, getFn: getTrustFactInfo } = makeHelpersForOptions(
  'id',
  (id): TrustFactInfo<typeof id> => ({
    id,
    label: id ?? '',
    icon: 'ri:question-line',
    one: id ?? '',
    many: id ?? '',
  }),
  [
    {
      id: 'publishedPosts',
      label: 'Published comments',
      icon: 'ri:chat-check-line',
      one: 'published comment',
      many: 'published comments',
    },
    {
      id: 'checkedProofPosts',
      label: 'Comments with checked proof',
      icon: 'ri:file-shield-2-line',
      one: 'comment with checked proof',
      many: 'comments with checked proof',
    },
    {
      id: 'approvedSuggestions',
      label: 'Approved suggestions',
      icon: 'ri:lightbulb-line',
      one: 'approved suggestion',
      many: 'approved suggestions',
    },
  ] as const satisfies TrustFactInfo<TrustFact>[]
)

type _ExpectAllFacts = Assert<Equals<(typeof trustFacts)[number]['id'], TrustFact>>
