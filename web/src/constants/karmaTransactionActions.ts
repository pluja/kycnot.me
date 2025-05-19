import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { KarmaTransactionAction } from '@prisma/client'

type KarmaTransactionActionInfo<T extends string | null | undefined = string> = {
  value: T
  slug: string
  label: string
  icon: string
}

export const {
  dataArray: karmaTransactionActions,
  dataObject: karmaTransactionActionsById,
  getFn: getKarmaTransactionActionInfo,
  getFnSlug: getKarmaTransactionActionInfoBySlug,
  zodEnumBySlug: karmaTransactionActionsZodEnumBySlug,
  zodEnumById: karmaTransactionActionsZodEnumById,
  keyToSlug: karmaTransactionActionIdToSlug,
  slugToKey: karmaTransactionActionSlugToId,
} = makeHelpersForOptions(
  'value',
  (value): KarmaTransactionActionInfo<typeof value> => ({
    value,
    slug: value ? value.toLowerCase() : '',
    label: value ? transformCase(value.replace('_', ' '), 'title') : String(value),
    icon: 'ri:question-line',
  }),
  [
    {
      value: 'COMMENT_APPROVED',
      slug: 'comment-approved',
      label: 'Comment approved',
      icon: 'ri:check-line',
    },
    {
      value: 'COMMENT_VERIFIED',
      slug: 'comment-verified',
      label: 'Comment verified',
      icon: 'ri:verified-badge-line',
    },
    {
      value: 'COMMENT_SPAM',
      slug: 'comment-spam',
      label: 'Comment marked as SPAM',
      icon: 'ri:spam-2-line',
    },
    {
      value: 'COMMENT_SPAM_REVERTED',
      slug: 'comment-spam-reverted',
      label: 'Comment SPAM reverted',
      icon: 'ri:spam-2-line',
    },
    {
      value: 'COMMENT_UPVOTE',
      slug: 'comment-upvote',
      label: 'Comment upvoted',
      icon: 'ri:thumb-up-line',
    },
    {
      value: 'COMMENT_DOWNVOTE',
      slug: 'comment-downvote',
      label: 'Comment downvoted',
      icon: 'ri:thumb-down-line',
    },
    {
      value: 'COMMENT_VOTE_REMOVED',
      slug: 'comment-vote-removed',
      label: 'Comment vote removed',
      icon: 'ri:thumb-up-line',
    },
    {
      value: 'SUGGESTION_APPROVED',
      slug: 'suggestion-approved',
      label: 'Suggestion approved',
      icon: 'ri:lightbulb-line',
    },
    {
      value: 'MANUAL_ADJUSTMENT',
      slug: 'manual-adjustment',
      label: 'Manual adjustment',
      icon: 'ri:gift-line',
    },
  ] as const satisfies KarmaTransactionActionInfo<KarmaTransactionAction>[]
)
