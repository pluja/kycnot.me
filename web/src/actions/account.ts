import { Prisma } from '@prisma/client'
import { ActionError } from 'astro:actions'
import { z } from 'astro:content'
import { pick } from 'lodash-es'

import { affiliationServiceWhere } from '../constants/serviceClaim'
import { claimableServiceUserRoleValues } from '../constants/serviceUserRoles'
import { trustUnlocksById } from '../constants/trustUnlocks'
import { createAccount } from '../lib/accountCreate'
import { generateApiKey, getApiKeyPrefix, hashApiKey } from '../lib/apiKey'
import { recordAuditLog } from '../lib/auditLog'
import { captchaFormSchemaProperties, captchaFormSchemaSuperRefine } from '../lib/captchaValidation'
import { cleanupCommentEvidenceFiles } from '../lib/commentEvidenceCleanup'
import { deleteUserAccount } from '../lib/dbFunctions'
import { defineProtectedAction } from '../lib/defineProtectedAction'
import { PICTURE_SIZE, saveImageUpload } from '../lib/fileStorage'
import { startImpersonating, stopImpersonating } from '../lib/impersonation'
import { prisma } from '../lib/prisma'
import { makeSafeRedirectUrl } from '../lib/redirectUrls'
import { getRedisPreGeneratedSecretTokens } from '../lib/redis/redisPreGeneratedSecretTokens'
import { claimHosts, domainChangedHands, domainRegisteredAt, findClaimHost } from '../lib/serviceClaim'
import { handleHoneypotTrap } from '../lib/spamDetection'
import { makeTrustUnlockMessage, makeUserWithTrust } from '../lib/trust'
import { login, logout, setUserSessionIdCookie } from '../lib/userCookies'
import {
  generateUserSecretToken,
  hashUserSecretToken,
  parseUserSecretToken,
  USER_SECRET_TOKEN_REGEX,
} from '../lib/userSecretToken'
import { displayNameSchema, httpUrlSchema, imageFileSchema } from '../lib/zodUtils'

// toPublicUser strips credential-equivalent fields before a User is returned
// from an action: the result is devalue-serialized into the PRG action session,
// so secretTokenHash (the login verifier) and feedId (the private-feed token)
// must not ride along.
function toPublicUser<T extends { secretTokenHash: string; feedId: string }>(user: T) {
  const { secretTokenHash, feedId, ...publicUser } = user
  return publicUser
}

// CLAIM_CHECK_INTERVAL_MS spaces out one user's DNS checks; the lookups go to hosts we list, but each costs a few
// seconds of DNS and RDAP traffic.
const CLAIM_CHECK_INTERVAL_MS = 15_000
const lastClaimCheckByUser = new Map<number, number>()

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

      await login(context, await makeUserWithTrust(matchedUser))

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
        redirect: z.string().max(2000).optional(),
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
        console.error(
          '[account.generate] no pre-generated token submitted, creating account from a fresh one'
        )
      }
      if (!isValidToken) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'Invalid or expired token',
        })
      }

      const { token, user: newUser } = await createAccount(input.token)
      await setUserSessionIdCookie(context.cookies, context.url, newUser.secretTokenHash)
      context.locals.user = await makeUserWithTrust(newUser)

      return {
        token,
        user: toPublicUser(newUser),
        redirect: makeSafeRedirectUrl(input.redirect, new URL(context.request.url).origin),
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

      await startImpersonating(context, adminUser, await makeUserWithTrust(targetUser))

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
      displayName: displayNameSchema.nullable(),
      link: httpUrlSchema.nullable(),
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
        !context.locals.user.trust.unlocks.displayName
      ) {
        throw new ActionError({
          code: 'FORBIDDEN',
          message: makeTrustUnlockMessage(trustUnlocksById.displayName),
        })
      }

      if (
        input.link !== null &&
        input.link !== context.locals.user.link &&
        !context.locals.user.trust.unlocks.websiteLink
      ) {
        throw new ActionError({
          code: 'FORBIDDEN',
          message: makeTrustUnlockMessage(trustUnlocksById.websiteLink),
        })
      }

      if (input.pictureFile !== undefined && !context.locals.user.trust.unlocks.profilePicture) {
        throw new ActionError({
          code: 'FORBIDDEN',
          message: makeTrustUnlockMessage(trustUnlocksById.profilePicture),
        })
      }

      if (input.removePicture && !context.locals.user.trust.unlocks.profilePicture) {
        throw new ActionError({
          code: 'FORBIDDEN',
          message: makeTrustUnlockMessage(trustUnlocksById.profilePicture),
        })
      }

      const pictureUrl =
        input.pictureFile && input.pictureFile.size > 0
          ? await saveImageUpload(
              input.pictureFile,
              `users/pictures/${String(context.locals.user.id)}`,
              PICTURE_SIZE
            )
          : undefined

      const user = await prisma.user.update({
        where: { id: context.locals.user.id },
        data: {
          displayName: context.locals.user.trust.unlocks.displayName
            ? (input.displayName ?? null)
            : undefined,
          link: context.locals.user.trust.unlocks.websiteLink ? (input.link ?? null) : undefined,
          picture: context.locals.user.trust.unlocks.profilePicture
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

      await deleteUserAccount(prisma, context.locals.user.id)

      await cleanupCommentEvidenceFiles()

      const deletedUser = pick(context.locals.user, ['id', 'name', 'displayName', 'picture'])

      if (context.locals.actualUser) {
        await stopImpersonating(context)
      } else {
        await logout(context)
      }

      return { deletedUser }
    },
  }),

  claimService: defineProtectedAction({
    accept: 'form',
    permissions: 'not-spammer',
    input: z.object({
      serviceId: z.coerce.number().int().positive(),
      role: z.enum(claimableServiceUserRoleValues),
    }),
    handler: async (input, context) => {
      const user = context.locals.user

      const now = Date.now()
      const lastCheck = lastClaimCheckByUser.get(user.id)
      if (lastCheck && now - lastCheck < CLAIM_CHECK_INTERVAL_MS) {
        throw new ActionError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Wait a few seconds before checking again.',
        })
      }
      lastClaimCheckByUser.set(user.id, now)
      if (lastClaimCheckByUser.size > 1000) {
        for (const [userId, checkedAt] of lastClaimCheckByUser) {
          if (now - checkedAt >= CLAIM_CHECK_INTERVAL_MS) lastClaimCheckByUser.delete(userId)
        }
      }

      const service = await prisma.service.findUnique({
        where: { id: input.serviceId, ...affiliationServiceWhere },
        select: {
          id: true,
          name: true,
          slug: true,
          serviceUrls: true,
          listedAt: true,
          unreachableChecks: true,
          verificationStatus: true,
          affiliatedUsers: { where: { userId: user.id }, select: { id: true } },
        },
      })
      if (!service) throw new ActionError({ code: 'NOT_FOUND', message: 'Service not found.' })
      if (service.affiliatedUsers.length > 0) {
        throw new ActionError({
          code: 'CONFLICT',
          message: `You are already affiliated with ${service.name}.`,
        })
      }
      if (service.verificationStatus === 'VERIFICATION_FAILED') {
        throw new ActionError({
          code: 'FORBIDDEN',
          message: `${service.name} is flagged as a scam, so it can't be claimed.`,
        })
      }
      if (service.unreachableChecks > 0) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: `The ${service.name} website did not answer our last check. Contact us to verify instead.`,
        })
      }

      const hosts = claimHosts(service.serviceUrls)
      if (hosts.length === 0) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: `${service.name} lists no website of its own, so it can't be claimed with DNS. Contact us instead.`,
        })
      }

      const host = await findClaimHost(hosts, user.name)
      if (!host) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: `No record for ${user.name} on ${hosts.join(' or ')} yet. DNS changes can take a while to show up.`,
        })
      }

      const registeredAt = await domainRegisteredAt(host)
      if (domainChangedHands(registeredAt, service.listedAt)) {
        throw new ActionError({
          code: 'FORBIDDEN',
          message: `${host} was registered after ${service.name} was listed here, so it may have changed owners. Contact us to verify instead.`,
        })
      }

      try {
        await prisma.$transaction(async (tx) => {
          await tx.serviceUser.create({
            data: {
              userId: user.id,
              serviceId: service.id,
              role: input.role,
              dnsHost: host,
              dnsCheckedAt: new Date(),
              domainRegisteredAt: registeredAt,
            },
          })
          await recordAuditLog(tx, {
            actorId: user.id,
            action: 'CREATED',
            targetType: 'USER',
            targetId: user.id,
            summary: `Claimed affiliation with ${service.name} as ${input.role.toLowerCase().replace('_', ' ')} through the DNS record on ${host}`,
          })
        })
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ActionError({
            code: 'CONFLICT',
            message: `You are already affiliated with ${service.name}.`,
          })
        }
        throw error
      }

      return { service: { name: service.name, slug: service.slug } }
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
