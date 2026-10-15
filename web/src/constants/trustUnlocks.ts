import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

export type TrustFact = 'approvedSuggestions' | 'checkedProofPosts' | 'publishedPosts'

export type TrustUnlockInfo<T extends string | null | undefined = string> = {
  id: T
  name: string
  verb: string
  icon: string
  // Reaching any one of these minimums is enough.
  anyOf: Partial<Record<TrustFact, number>>
  minAccountDays: number
}

export const { dataArray: trustUnlocks, dataObject: trustUnlocksById } = makeHelpersForOptions(
  'id',
  (id): TrustUnlockInfo<typeof id> => ({
    id,
    name: id ? transformCase(id, 'title') : String(id),
    verb: id ? transformCase(id, 'sentence') : String(id),
    icon: 'ri:question-line',
    anyOf: {},
    minAccountDays: 0,
  }),
  [
    {
      id: 'displayName',
      name: 'Display name',
      verb: 'set a display name',
      icon: 'ri:user-smile-line',
      anyOf: { publishedPosts: 3 },
      minAccountDays: 30,
    },
    {
      id: 'websiteLink',
      name: 'Website link',
      verb: 'add a website link',
      icon: 'ri:link',
      anyOf: { checkedProofPosts: 1 },
      minAccountDays: 60,
    },
    {
      id: 'profilePicture',
      name: 'Profile picture',
      verb: 'set a profile picture',
      icon: 'ri:image-line',
      anyOf: { publishedPosts: 5 },
      minAccountDays: 60,
    },
    {
      id: 'veteranBadge',
      name: 'Veteran badge',
      verb: 'get the Veteran badge',
      icon: 'ri:medal-line',
      anyOf: { checkedProofPosts: 5, publishedPosts: 20, approvedSuggestions: 5 },
      minAccountDays: 180,
    },
  ] as const satisfies TrustUnlockInfo[]
)

export type TrustUnlockId = (typeof trustUnlocks)[number]['id']
