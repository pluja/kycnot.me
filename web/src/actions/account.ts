import { ActionError } from 'astro:actions'
import { z } from 'astro:content'
import { pick } from 'lodash-es'

import { karmaUnlocksById } from '../constants/karmaUnlocks'
import { createAccount } from '../lib/accountCreate'
import { captchaFormSchemaProperties, captchaFormSchemaSuperRefine } from '../lib/captchaValidation'
import { defineProtectedAction } from '../lib/defineProtectedAction'
import { saveFileLocally } from '../lib/fileStorage'
import { startImpersonating, stopImpersonating } from '../lib/impersonation'
import { makeKarmaUnlockMessage, makeUserWithKarmaUnlocks } from '../lib/karmaUnlocks'
import { prisma } from '../lib/prisma'
import { makeSafeRedirectUrl } from '../lib/redirectUrls'
import { redisPreGeneratedSecretTokens } from '../lib/redis/redisPreGeneratedSecretTokens'
import { handleHoneypotTrap } from '../lib/spamDetection'
import { login, logout, setUserSessionIdCookie } from '../lib/userCookies'
import {
  generateUserSecretToken,
  hashUserSecretToken,
  parseUserSecretToken,
  USER_SECRET_TOKEN_REGEX,
} from '../lib/userSecretToken'
import { imageFileSchema } from '../lib/zodUtils'

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
        user: matchedUser,
        redirect: makeSafeRedirectUrl(input.redirect ?? context.request.headers.get('referer'), origin),
      }
    },
  }),

  preGenerateToken: defineProtectedAction({
    accept: 'form',
    permissions: 'guest',
    handler: async () => {
      const token = generateUserSecretToken()
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

      const isValidToken = input.token
        ? await redisPreGeneratedSecretTokens.validateAndConsumePreGeneratedToken(input.token)
        : true
      if (!isValidToken) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'Invalid or expired token',
        })
      }

      const { token, user: newUser } = await createAccount(input.token)
      await setUserSessionIdCookie(context.cookies, newUser.secretTokenHash)
      context.locals.user = makeUserWithKarmaUnlocks(newUser)

      return {
        token,
        user: newUser,
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
        adminUser,
        impersonatedUser: targetUser,
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

      return { user }
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
      if (context.locals.user.admin || context.locals.user.moderator) {
        throw new ActionError({
          code: 'FORBIDDEN',
          message: 'Admins and moderators cannot delete their own accounts.',
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
}
