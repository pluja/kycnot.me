import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { Assert } from '../lib/assert'
import type { Equals } from 'ts-toolbelt/out/Any/Equals'

type UserSentimentInfo<T extends string | null | undefined = string> = {
  id: T
  icon: string
  name: string
  classNames: {
    icon: string
    borderColor: string
    background: string
  }
}

export const {
  dataArray: userSentiments,
  dataObject: userSentimentsById,
  getFn: getUserSentimentInfo,
} = makeHelpersForOptions(
  'id',
  (id): UserSentimentInfo<typeof id> => ({
    id,
    icon: 'ri:emotion-normal-line',
    name: id ? transformCase(id, 'title') : String(id),
    classNames: {
      icon: 'text-yellow-400',
      borderColor: 'border-yellow-500/40',
      background: 'bg-yellow-950/20',
    },
  }),
  [
    {
      id: 'positive',
      icon: 'ri:emotion-happy-line',
      name: 'Positive',
      classNames: {
        icon: 'text-green-400',
        borderColor: 'border-green-500/40',
        background: 'bg-green-950/20',
      },
    },
    {
      id: 'neutral',
      icon: 'ri:emotion-normal-line',
      name: 'Neutral',
      classNames: {
        icon: 'text-blue-400',
        borderColor: 'border-blue-500/40',
        background: 'bg-blue-950/20',
      },
    },
    {
      id: 'negative',
      icon: 'ri:emotion-unhappy-line',
      name: 'Negative',
      classNames: {
        icon: 'text-red-400',
        borderColor: 'border-red-500/40',
        background: 'bg-red-950/20',
      },
    },
  ] as const satisfies UserSentimentInfo<PrismaJson.UserSentiment['sentiment']>[]
)

type _ExpectToHaveAllValues = Assert<
  Equals<(typeof userSentiments)[number]['id'], PrismaJson.UserSentiment['sentiment']>
>
