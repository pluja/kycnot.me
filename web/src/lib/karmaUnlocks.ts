import { karmaUnlocksById, type KarmaUnlockInfo } from '../constants/karmaUnlocks'

export type KarmaUnlocks = {
  [K in keyof typeof karmaUnlocksById]: boolean
}

export function computeKarmaUnlocks(karma: number) {
  return Object.fromEntries(
    Object.entries(karmaUnlocksById).map(([key, value]) => [
      key,
      value.karma >= 0 ? karma >= value.karma : karma <= value.karma,
    ])
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
