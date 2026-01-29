import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { Assert } from '../lib/assert'
import type { Equals } from 'ts-toolbelt/out/Any/Equals'

type TosHighlightRatingInfo<T extends string | null | undefined = string> = {
  id: T
  icon: string
  name: string
  classNames: {
    icon: string
    borderColor: string
  }
  order: number
}

export const {
  dataArray: tosHighlightRatings,
  dataObject: tosHighlightRatingsById,
  getFn: getTosHighlightRatingInfo,
} = makeHelpersForOptions(
  'id',
  (id): TosHighlightRatingInfo<typeof id> => ({
    id,
    icon: 'ri:question-line',
    name: id ? transformCase(id, 'title') : String(id),
    classNames: {
      icon: 'text-yellow-400',
      borderColor: 'border-yellow-500/40',
    },
    order: Infinity,
  }),
  [
    {
      id: 'negative',
      icon: 'ri:thumb-down-line',
      name: 'Negative',
      classNames: {
        icon: 'text-red-400',
        borderColor: 'border-red-500/40',
      },
      order: 1,
    },
    {
      id: 'positive',
      icon: 'ri:thumb-up-line',
      name: 'Positive',
      classNames: {
        icon: 'text-green-400',
        borderColor: 'border-green-500/40',
      },
      order: 2,
    },
    {
      id: 'neutral',
      icon: 'ri:information-line',
      name: 'Neutral',
      classNames: {
        icon: 'text-blue-400',
        borderColor: 'border-blue-500/40',
      },
      order: 3,
    },
  ] as const satisfies TosHighlightRatingInfo<PrismaJson.TosReview['highlights'][number]['rating']>[]
)

type _ExpectToHaveAllValues = Assert<
  Equals<(typeof tosHighlightRatings)[number]['id'], PrismaJson.TosReview['highlights'][number]['rating']>
>
