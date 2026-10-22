import { differenceInDays } from 'date-fns'

import { getTrustFactInfo, trustFacts } from '../constants/trustFacts'
import {
  trustUnlocks,
  type TrustFact,
  type TrustUnlockId,
  type TrustUnlockInfo,
} from '../constants/trustUnlocks'

import { userTrustRows, type UserTrustRow } from './dbFunctions'
import { publishedCommentStatuses } from './experiences'
import { countOf } from './pluralize'
import { prisma } from './prisma'

export type TrustFacts = Omit<UserTrustRow, 'userId'>

export type TrustUnlocks = Record<TrustUnlockId, boolean>

// trustRecord is the account's public record: what it published and what moderators accepted. Replies don't
// count toward trust; they sit next to comments so the two numbers aren't mistaken for one.
export const trustRecord = (trust: TrustFacts, replyCount: number) =>
  trustFacts.flatMap((fact) => {
    const entry = { label: fact.label, icon: fact.icon, count: trust[fact.id] }
    return fact.id === 'publishedPosts'
      ? [entry, { label: 'Replies', icon: 'ri:reply-line', count: replyCount }]
      : [entry]
  })

export const countPublishedReplies = (userId: number) =>
  prisma.comment.count({
    where: { authorId: userId, parentId: { not: null }, status: { in: publishedCommentStatuses } },
  })

export type UserTrust = TrustFacts & { unlocks: TrustUnlocks }

const noTrust: TrustFacts = {
  publishedPosts: 0,
  checkedProofPosts: 0,
  approvedSuggestions: 0,
  penalizingRejections: 0,
  spamRejections: 0,
  untrusted: false,
  commentsDisabled: false,
}

export async function getTrustFacts(userIds: number[]) {
  if (userIds.length === 0) return new Map<number, TrustFacts>()
  const rows = await userTrustRows(prisma, userIds)
  return new Map(rows.map(({ userId, ...facts }) => [userId, facts]))
}

function isTrustUnlocked(
  unlock: Pick<TrustUnlockInfo, 'anyOf' | 'minAccountDays'>,
  facts: Pick<TrustFacts, TrustFact>,
  accountCreatedAt: Date,
  now = new Date()
) {
  const reachesAFact = Object.entries(unlock.anyOf).some(
    ([fact, minimum]) => facts[fact as TrustFact] >= minimum
  )
  return reachesAFact && differenceInDays(now, accountCreatedAt) >= unlock.minAccountDays
}

// computeTrustUnlocks locks everything while a penalty applies.
export function computeTrustUnlocks(facts: TrustFacts, accountCreatedAt: Date, now = new Date()) {
  const penalized = facts.untrusted || facts.commentsDisabled
  return Object.fromEntries(
    trustUnlocks.map((unlock) => [
      unlock.id,
      !penalized && isTrustUnlocked(unlock, facts, accountCreatedAt, now),
    ])
  ) as TrustUnlocks
}

type TrustSubject = { id: number; createdAt: Date }

export async function makeUserWithTrust<T extends TrustSubject>(user: T): Promise<T & { trust: UserTrust }>
export async function makeUserWithTrust<T extends TrustSubject>(
  user: T | null
): Promise<(T & { trust: UserTrust }) | null>
export async function makeUserWithTrust<T extends TrustSubject>(user: T | null) {
  if (!user) return null
  const facts = (await getTrustFacts([user.id])).get(user.id) ?? noTrust
  return { ...user, trust: { ...facts, unlocks: computeTrustUnlocks(facts, user.createdAt) } }
}

export function describeTrustRequirement(unlock: Pick<TrustUnlockInfo, 'anyOf' | 'minAccountDays'>) {
  const facts = Object.entries(unlock.anyOf)
    .map(([fact, minimum]) => {
      const info = getTrustFactInfo(fact as TrustFact)
      return countOf(minimum, info.one, info.many)
    })
    .join(' or ')
  return `${facts}, and an account at least ${String(unlock.minAccountDays)} days old`
}

export function makeTrustUnlockMessage(unlock: TrustUnlockInfo) {
  return `You need ${describeTrustRequirement(unlock)} to ${unlock.verb}.`
}

export const commentsDisabledMessage = 'Posting is disabled on this account after repeated spam.'
