import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

export type KarmaUnlockInfo<T extends string | null | undefined = string> = {
  id: T
  name: string
  verb: string
  description: string
  karma: number
  icon: string
}

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
      id: 'voteComments',
      name: 'Vote on comments',
      verb: 'vote on comments',
      description: 'You can vote on comments',
      karma: 20,
      icon: 'ri:thumb-up-line',
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
      id: 'displayName',
      name: 'Display name',
      verb: 'have a display name',
      description: 'You can change your display name',
      karma: 150,
      icon: 'ri:user-smile-line',
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
