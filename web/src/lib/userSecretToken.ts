import crypto from 'crypto'

import { z } from 'astro/zod'
import { escapeRegExp } from 'lodash-es'

import {
  DIGIT_CHARACTERS,
  LOWERCASE_CONSONANT_CHARACTERS,
  LOWERCASE_VOWEL_CHARACTERS,
} from '../constants/characters'

import { getRandom, typedJoin } from './arrays'
import { DEPLOYMENT_MODE } from './envVariables'
import { transformCase } from './strings'

const DIGEST = 'sha512'

const USER_SECRET_TOKEN_LETTERS_SEGMENT_REGEX =
  `(?:(?:[${typedJoin(LOWERCASE_VOWEL_CHARACTERS)}${transformCase(typedJoin(LOWERCASE_VOWEL_CHARACTERS), 'upper')}][${typedJoin(LOWERCASE_CONSONANT_CHARACTERS)}${transformCase(typedJoin(LOWERCASE_CONSONANT_CHARACTERS), 'upper')}]){2})` as const
const USER_SECRET_TOKEN_DIGITS_SEGMENT_REGEX = `(?:[${typedJoin(DIGIT_CHARACTERS)}]{4})` as const
const USER_SECRET_TOKEN_SEPARATOR_REGEX = '(?:(-| )+)'

export const includeDevUsers = DEPLOYMENT_MODE !== 'production'

const USER_SECRET_TOKEN_DEV_USERS_REGEX = (() => {
  const specialUsersData = [
    {
      envToken: 'DEV_ADMIN_USER_SECRET_TOKEN',
      defaultToken: 'admin',
    },
    {
      envToken: 'DEV_MODERATOR_USER_SECRET_TOKEN',
      defaultToken: 'moderator',
    },
    {
      envToken: 'DEV_VERIFIED_USER_SECRET_TOKEN',
      defaultToken: 'verified',
    },
    {
      envToken: 'DEV_NORMAL_USER_SECRET_TOKEN',
      defaultToken: 'normal',
    },
    {
      envToken: 'DEV_SPAM_USER_SECRET_TOKEN',
      defaultToken: 'spam',
    },
  ] as const satisfies {
    envToken: string
    defaultToken: string
  }[]

  const env =
    // This file can also be called from faker.ts, where import.meta.env is not available
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    (import.meta.env
      ? Object.fromEntries(specialUsersData.map(({ envToken }) => [envToken, import.meta.env[envToken]]))
      : undefined) ?? process.env

  return `(?:${typedJoin(
    specialUsersData.map(({ envToken, defaultToken }) =>
      typedJoin(
        ((env[envToken] as string | undefined) ?? defaultToken).match(/(.{4}|.{1,3}$)/g)?.map(
          (segment) =>
            `${segment
              .split('')
              .map((char) => `(?:${escapeRegExp(char.toUpperCase())}|${escapeRegExp(char.toLowerCase())})`)
              .join('')}${USER_SECRET_TOKEN_SEPARATOR_REGEX}?`
        ) ?? []
      )
    ),
    '|'
  )})` as const
})()

const USER_SECRET_TOKEN_FULL_REGEX_STRING =
  `(?:(?:${USER_SECRET_TOKEN_LETTERS_SEGMENT_REGEX}${USER_SECRET_TOKEN_SEPARATOR_REGEX}?){4}${USER_SECRET_TOKEN_DIGITS_SEGMENT_REGEX})` as const
export const USER_SECRET_TOKEN_REGEX_STRING =
  `^(?:${USER_SECRET_TOKEN_FULL_REGEX_STRING}${includeDevUsers ? `|${USER_SECRET_TOKEN_DEV_USERS_REGEX}` : ''})$` as const
export const USER_SECRET_TOKEN_REGEX = new RegExp(USER_SECRET_TOKEN_REGEX_STRING)

export const userSecretTokenZodSchema = z
  .string()
  .regex(USER_SECRET_TOKEN_REGEX)
  .transform(parseUserSecretToken)

export function generateUserSecretToken(): string {
  const token = [
    getRandom(LOWERCASE_VOWEL_CHARACTERS),
    getRandom(LOWERCASE_CONSONANT_CHARACTERS),
    getRandom(LOWERCASE_VOWEL_CHARACTERS),
    getRandom(LOWERCASE_CONSONANT_CHARACTERS),

    getRandom(LOWERCASE_VOWEL_CHARACTERS),
    getRandom(LOWERCASE_CONSONANT_CHARACTERS),
    getRandom(LOWERCASE_VOWEL_CHARACTERS),
    getRandom(LOWERCASE_CONSONANT_CHARACTERS),

    getRandom(LOWERCASE_VOWEL_CHARACTERS),
    getRandom(LOWERCASE_CONSONANT_CHARACTERS),
    getRandom(LOWERCASE_VOWEL_CHARACTERS),
    getRandom(LOWERCASE_CONSONANT_CHARACTERS),

    getRandom(LOWERCASE_VOWEL_CHARACTERS),
    getRandom(LOWERCASE_CONSONANT_CHARACTERS),
    getRandom(LOWERCASE_VOWEL_CHARACTERS),
    getRandom(LOWERCASE_CONSONANT_CHARACTERS),

    getRandom(DIGIT_CHARACTERS),
    getRandom(DIGIT_CHARACTERS),
    getRandom(DIGIT_CHARACTERS),
    getRandom(DIGIT_CHARACTERS),
  ].join('')

  return parseUserSecretToken(token)
}

export function hashUserSecretToken(token: string): string {
  return crypto.createHash(DIGEST).update(token).digest('hex')
}

export function parseUserSecretToken(token: string): string {
  if (!USER_SECRET_TOKEN_REGEX.test(token)) {
    throw new Error(
      `Invalid user secret token. Token "${token}" does not match regex ${USER_SECRET_TOKEN_REGEX_STRING}`
    )
  }

  return token.toLocaleLowerCase().replace(new RegExp(USER_SECRET_TOKEN_SEPARATOR_REGEX, 'g'), '')
}

export function prettifyUserSecretToken(token: string): string {
  const parsedToken = parseUserSecretToken(token)

  const groups = parsedToken.toLocaleUpperCase().match(/.{4}/g)
  if (!groups || groups.length !== 5) {
    throw new Error('Error while prettifying user secret token')
  }
  return groups.join('-')
}

/**
 * Verify a token against a stored hash using a constant-time comparison
 */
export function verifyUserSecretToken(token: string, hash: string): boolean {
  const correctHash = hashUserSecretToken(token)

  // Use crypto.timingSafeEqual to prevent timing attacks
  return crypto.timingSafeEqual(Buffer.from(correctHash, 'hex'), Buffer.from(hash, 'hex'))
}
