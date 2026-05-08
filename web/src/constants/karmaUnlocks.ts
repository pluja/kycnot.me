import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

export type KarmaUnlockInfo<T extends string | null | undefined = string> = {
  id: T
  name: string
  verb: string
  description: string
  karma: number
  icon: string
  reviewWeight?: number
  unlockDirection?: 'gte' | 'lte'
  karmaLabel?: string
}

export const APPROVED_ORDER_ID_REVIEW_WEIGHT = 0.9

export const { dataArray: karmaUnlocks, dataObject: karmaUnlocksById } = makeHelpersForOptions(
  'id',
  (id): KarmaUnlockInfo<typeof id> => ({
    id,
    name: id ? transformCase(id, 'title') : String(id),
    description: id ? transformCase(id, 'sentence') : String(id),
    karma: 0,
    icon: 'ri:question-line',
    verb: id ? transformCase(id, 'title') : String(id),
  }),
  [
    {
      id: 'baseReviewWeight',
      name: '10% review weight*',
      verb: 'get 10% review weight',
      description: 'Your ratings have limited impact on service scores',
      karma: -4,
      karmaLabel: 'above -5 karma',
      icon: 'ri:scales-3-line',
      reviewWeight: 0.1,
      unlockDirection: 'gte',
    },
    {
      id: 'someActivityReviewWeight',
      name: '20% review weight*',
      verb: 'get 20% review weight',
      description: 'Your ratings count more after some account activity',
      karma: 5,
      icon: 'ri:scales-3-line',
      reviewWeight: 0.2,
    },
    {
      id: 'voteComments',
      name: 'Vote on comments',
      verb: 'vote on comments',
      description: 'You can vote on comments',
      karma: 20,
      icon: 'ri:thumb-up-line',
    },
    {
      id: 'activeReviewWeight',
      name: '45% review weight*',
      verb: 'get 45% review weight',
      description: 'Your ratings count as active-user feedback',
      karma: 25,
      icon: 'ri:scales-3-line',
      reviewWeight: 0.45,
    },
    {
      id: 'trustedReviewWeight',
      name: '80% review weight*',
      verb: 'get 80% review weight',
      description: 'Your ratings count as high-karma feedback',
      karma: 150,
      icon: 'ri:scales-3-line',
      reviewWeight: 0.8,
    },
    {
      id: 'displayName',
      name: 'Display name',
      verb: 'have a display name',
      description: 'You can change your display name',
      karma: 150,
      icon: 'ri:user-smile-line',
    },
    {
      id: 'websiteLink',
      name: 'Website link',
      verb: 'add a website link',
      description: 'You can add a website link to your profile',
      karma: 175,
      icon: 'ri:link',
    },
    {
      id: 'profilePicture',
      name: 'Profile picture',
      verb: 'have a profile picture',
      description: 'You can change your profile picture',
      karma: 200,
      icon: 'ri:image-line',
    },
    {
      id: 'highKarmaBadge',
      name: 'High Karma badge',
      verb: 'become a high karma user',
      description: 'You are a high karma user',
      karma: 500,
      icon: 'ri:shield-star-line',
    },
    {
      id: 'reviewsNotCounted',
      name: '0% review weight*',
      verb: 'get 0% review weight',
      description: 'Your ratings do not affect service scores',
      karma: -5,
      icon: 'ri:scales-3-line',
      reviewWeight: 0,
    },
    {
      id: 'negativeKarmaBadge',
      name: 'Negative Karma badge',
      verb: 'be a suspicious user',
      description: 'You are a suspicious user',
      karma: -10,
      icon: 'ri:error-warning-line',
    },
    {
      id: 'untrustedBadge',
      name: 'Untrusted badge',
      verb: 'be an untrusted user',
      description: 'You are an untrusted user',
      karma: -30,
      icon: 'ri:spam-2-line',
    },
    {
      id: 'commentsDisabled',
      name: 'Comments disabled',
      verb: 'cannot comment',
      description: 'You cannot comment',
      karma: -50,
      icon: 'ri:forbid-line',
    },
  ] as const satisfies KarmaUnlockInfo[]
)

// keep reviewWeight unlocks in sync with calculate_comment_rating_trust() in prisma/triggers/03_service_user_rating.sql.
// changing review weight thresholds requires updating the trigger and its drift test.
export const MIN_TRUSTED_RATING_WEIGHT = karmaUnlocksById.activeReviewWeight.reviewWeight
