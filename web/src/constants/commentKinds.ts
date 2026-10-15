import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { Assert } from '../lib/assert'
import type { CommentKind } from '@prisma/client'
import type { Equals } from 'ts-toolbelt/out/Any/Equals'

type CommentKindInfo<T extends string | null | undefined = string> = {
  value: T
  label: string
  // Moderators can classify a post as this kind.
  classifiable: boolean
}

export const { dataArray: commentKinds, getFn: getCommentKindInfo } = makeHelpersForOptions(
  'value',
  (value): CommentKindInfo<typeof value> => ({
    value,
    label: value ? transformCase(value, 'title') : String(value),
    classifiable: false,
  }),
  [
    { value: 'EXPERIENCE', label: 'Experience', classifiable: true },
    { value: 'DISCUSSION', label: 'Discussion', classifiable: true },
    { value: 'UNCLASSIFIED', label: 'Unclassified', classifiable: false },
  ] as const satisfies CommentKindInfo<CommentKind>[]
)

type _ExpectAllKinds = Assert<Equals<(typeof commentKinds)[number]['value'], CommentKind>>
