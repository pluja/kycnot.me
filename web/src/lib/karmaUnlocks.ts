import { karmaUnlocksById, type KarmaUnlockInfo } from '../constants/karmaUnlocks'

const isKarmaUnlockUnlocked = (karma: number, unlock: KarmaUnlockInfo) => {
  const direction = unlock.unlockDirection ?? (unlock.karma >= 0 ? 'gte' : 'lte')
  return direction === 'gte' ? karma >= unlock.karma : karma <= unlock.karma
}

export type KarmaUnlocks = {
  [K in keyof typeof karmaUnlocksById]: boolean
}

export function computeKarmaUnlocks(karma: number) {
  return Object.fromEntries(
    Object.entries(karmaUnlocksById).map(([key, value]) => [key, isKarmaUnlockUnlocked(karma, value)])
  ) as KarmaUnlocks
}

export function makeUserWithKarmaUnlocks(user: null): null
export function makeUserWithKarmaUnlocks<T extends { totalKarma: number }>(
  user: T
): T & { karmaUnlocks: KarmaUnlocks }
export function makeUserWithKarmaUnlocks<T extends { totalKarma: number }>(
  user: T | null
): (T & { karmaUnlocks: KarmaUnlocks }) | null
export function makeUserWithKarmaUnlocks<T extends { totalKarma: number }>(user: T | null) {
  return user ? { ...user, karmaUnlocks: computeKarmaUnlocks(user.totalKarma) } : null
}

export function makeKarmaUnlockMessage(karmaUnlock: KarmaUnlockInfo) {
  return `You need ${karmaUnlock.karma.toLocaleString()} karma to ${karmaUnlock.verb}.` as const
}
