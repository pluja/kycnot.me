import { ActionError } from 'astro:actions'
import { z } from 'astro:content'
import { pick } from 'lodash-es'

import { karmaUnlocksById } from '../constants/karmaUnlocks'
import { createAccount } from '../lib/accountCreate'
import { generateApiKey, getApiKeyPrefix, hashApiKey } from '../lib/apiKey'
import { captchaFormSchemaProperties, captchaFormSchemaSuperRefine } from '../lib/captchaValidation'
import { defineProtectedAction } from '../lib/defineProtectedAction'
import { saveFileLocally } from '../lib/fileStorage'
import { startImpersonating, stopImpersonating } from '../lib/impersonation'
import { makeKarmaUnlockMessage, makeUserWithKarmaUnlocks } from '../lib/karmaUnlocks'
import { prisma } from '../lib/prisma'
import { makeSafeRedirectUrl } from '../lib/redirectUrls'
import { getRedisPreGeneratedSecretTokens } from '../lib/redis/redisPreGeneratedSecretTokens'
import { handleHoneypotTrap } from '../lib/spamDetection'
import { login, logout, setUserSessionIdCookie } from '../lib/userCookies'
import {
  generateUserSecretToken,
  hashUserSecretToken,
  parseUserSecretToken,
  USER_SECRET_TOKEN_REGEX,
} from '../lib/userSecretToken'
import { imageFileSchema } from '../lib/zodUtils'

// toPublicUser strips credential-equivalent fields before a User is returned
// from an action: the result is devalue-serialized into the PRG action session,
// so secretTokenHash (the login verifier) and feedId (the private-feed token)
// must not ride along.
function toPublicUser<T extends { secretTokenHash: string; feedId: string }>(user: T) {
  const { secretTokenHash, feedId, ...publicUser } = user
  return publicUser
}

export const accountActions = {
  login: defineProtectedAction({
    accept: 'form',
    permissions: 'guest',
    input: z.object({
      token: z.string().regex(USER_SECRET_TOKEN_REGEX).transform(parseUserSecretToken),
      redirect: z.string().optional(),
    }),
    handler: async (input, context) => {
      await logout(context)

      const tokenHash = hashUserSecretToken(input.token)
      const matchedUser = await prisma.user.findFirst({
        where: {
          secretTokenHash: tokenHash,
        },
      })

      if (!matchedUser) {
        throw new ActionError({
          code: 'UNAUTHORIZED',
          message: 'No user exists with this token',
        })
      }

      await login(context, makeUserWithKarmaUnlocks(matchedUser))

      const origin = new URL(context.request.url).origin
      return {
        user: toPublicUser(matchedUser),
        redirect: makeSafeRedirectUrl(input.redirect ?? context.request.headers.get('referer'), origin),
      }
    },
  }),

  preGenerateToken: defineProtectedAction({
    accept: 'form',
    permissions: 'guest',
    handler: async () => {
      const token = generateUserSecretToken()
      const redisPreGeneratedSecretTokens = await getRedisPreGeneratedSecretTokens()
      await redisPreGeneratedSecretTokens.storePreGeneratedToken(token)
      return {
        token,
      } as const
    },
  }),

  generate: defineProtectedAction({
    accept: 'form',
    permissions: 'guest',
    input: z
      .object({
        token: z.string().regex(USER_SECRET_TOKEN_REGEX).transform(parseUserSecretToken).optional(),
        /** @deprecated Honey pot field, do not use */
        message: z.unknown().optional(),
        ...captchaFormSchemaProperties,
      })
      .superRefine(captchaFormSchemaSuperRefine),
    handler: async (input, context) => {
      await handleHoneypotTrap({
        input,
        honeyPotTrapField: 'message',
        userId: context.locals.user?.id,
        location: 'account.generate',
      })

      let isValidToken = true
      if (input.token) {
        const redisPreGeneratedSecretTokens = await getRedisPreGeneratedSecretTokens()
        isValidToken = await redisPreGeneratedSecretTokens.validateAndConsumePreGeneratedToken(input.token)
      } else {
        // The form always submits one, so a miss means the password manager
        // saved a token this account will not use.
        console.error('[account.generate] no pre-generated token submitted, creating account from a fresh one')
      }
      if (!isValidToken) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'Invalid or expired token',
        })
      }

      const { token, user: newUser } = await createAccount(input.token)
      await setUserSessionIdCookie(context.cookies, context.url, newUser.secretTokenHash)
      context.locals.user = makeUserWithKarmaUnlocks(newUser)

      return {
        token,
        user: toPublicUser(newUser),
      } as const
    },
  }),

  impersonate: defineProtectedAction({
    accept: 'form',
    permissions: 'admin',
    input: z.object({
      targetUserId: z.coerce.number().int().positive(),
      redirect: z.string().optional(),
    }),
    handler: async (input, context) => {
      const adminUser = context.locals.user

      const targetUser = await prisma.user.findUnique({
        where: { id: input.targetUserId },
      })

      if (!targetUser) {
        throw new ActionError({
          code: 'NOT_FOUND',
          message: 'Target user not found',
        })
      }

      if (targetUser.admin) {
        throw new ActionError({
          code: 'FORBIDDEN',
          message: 'Cannot impersonate admin user',
        })
      }

      await startImpersonating(context, adminUser, makeUserWithKarmaUnlocks(targetUser))

      const origin = new URL(context.request.url).origin
      return {
        adminUser: toPublicUser(adminUser),
        impersonatedUser: toPublicUser(targetUser),
        redirect: makeSafeRedirectUrl(input.redirect ?? context.request.headers.get('referer'), origin),
      }
    },
  }),

  update: defineProtectedAction({
    accept: 'form',
    permissions: 'user',
    input: z.object({
      id: z.coerce.number().int().positive(),
      displayName: z.string().max(100, 'Display name must be 100 characters or less').nullable(),
      link: z.string().url('Must be a valid URL').max(255, 'URL must be 255 characters or less').nullable(),
      pictureFile: imageFileSchema,
      removePicture: z.coerce.boolean(),
    }),
    handler: async (input, context) => {
      if (input.id !== context.locals.user.id) {
        throw new ActionError({
          code: 'FORBIDDEN',
          message: 'You can only update your own profile',
        })
      }

      if (
        input.displayName !== null &&
        input.displayName !== context.locals.user.displayName &&
        !context.locals.user.karmaUnlocks.displayName
      ) {
        throw new ActionError({
          code: 'FORBIDDEN',
          message: makeKarmaUnlockMessage(karmaUnlocksById.displayName),
        })
      }

      if (
        input.link !== null &&
        input.link !== context.locals.user.link &&
        !context.locals.user.karmaUnlocks.websiteLink
      ) {
        throw new ActionError({
          code: 'FORBIDDEN',
          message: makeKarmaUnlockMessage(karmaUnlocksById.websiteLink),
        })
      }

      if (input.pictureFile !== undefined && !context.locals.user.karmaUnlocks.profilePicture) {
        throw new ActionError({
          code: 'FORBIDDEN',
          message: makeKarmaUnlockMessage(karmaUnlocksById.profilePicture),
        })
      }

      if (input.removePicture && !context.locals.user.karmaUnlocks.profilePicture) {
        throw new ActionError({
          code: 'FORBIDDEN',
          message: makeKarmaUnlockMessage(karmaUnlocksById.profilePicture),
        })
      }

      const pictureUrl =
        input.pictureFile && input.pictureFile.size > 0
          ? await saveFileLocally(
              input.pictureFile,
              input.pictureFile.name,
              `users/pictures/${String(context.locals.user.id)}`
            )
          : undefined

      const user = await prisma.user.update({
        where: { id: context.locals.user.id },
        data: {
          displayName: context.locals.user.karmaUnlocks.displayName ? (input.displayName ?? null) : undefined,
          link: context.locals.user.karmaUnlocks.websiteLink ? (input.link ?? null) : undefined,
          picture: context.locals.user.karmaUnlocks.profilePicture
            ? input.removePicture
              ? null
              : (pictureUrl ?? undefined)
            : undefined,
        },
      })

      return { user: toPublicUser(user) }
    },
  }),

  delete: defineProtectedAction({
    accept: 'form',
    permissions: 'user',
    input: z
      .object({
        ...captchaFormSchemaProperties,
      })
      .superRefine(captchaFormSchemaSuperRefine),
    handler: async (_input, context) => {
      if (context.locals.user.admin || context.locals.user.capabilities.length > 0) {
        throw new ActionError({
          code: 'FORBIDDEN',
          message: 'Admins and staff cannot delete their own accounts.',
        })
      }

      await prisma.user.delete({
        where: { id: context.locals.user.id },
      })

      const deletedUser = pick(context.locals.user, ['id', 'name', 'displayName', 'picture'])

      if (context.locals.actualUser) {
        await stopImpersonating(context)
      } else {
        await logout(context)
      }

      return { deletedUser }
    },
  }),

  apiKeyCreate: defineProtectedAction({
    accept: 'form',
    permissions: 'user',
    input: z.object({
      name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
    }),
    handler: async (input, context) => {
      const user = context.locals.user

      if (!user.canCreateApiKeys) {
        throw new ActionError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to create API keys. Contact an admin.',
        })
      }

      const hasAffiliation = await prisma.serviceUser.count({ where: { userId: user.id } })
      if (!user.verified && hasAffiliation === 0) {
        throw new ActionError({
          code: 'FORBIDDEN',
          message: 'You must be verified or affiliated with a service to create API keys.',
        })
      }

      const existingCount = await prisma.apiKey.count({ where: { userId: user.id } })
      if (existingCount >= 1) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'You already have an API key. Delete the existing one to create a new one.',
        })
      }

      const rawKey = generateApiKey()
      const apiKey = await prisma.apiKey.create({
        data: {
          name: input.name,
          keyHash: hashApiKey(rawKey),
          keyPrefix: getApiKeyPrefix(rawKey),
          userId: user.id,
        },
        select: { id: true, name: true, keyPrefix: true, createdAt: true },
      })

      return { rawKey, apiKey }
    },
  }),

  apiKeyDelete: defineProtectedAction({
    accept: 'form',
    permissions: 'user',
    input: z.object({
      id: z.coerce.number().int().positive(),
    }),
    handler: async (input, context) => {
      const apiKey = await prisma.apiKey.findUnique({
        where: { id: input.id },
        select: { userId: true },
      })

      if (apiKey?.userId !== context.locals.user.id) {
        throw new ActionError({
          code: 'NOT_FOUND',
          message: 'API key not found',
        })
      }

      await prisma.apiKey.delete({ where: { id: input.id } })

      return { success: true }
    },
  }),
}
