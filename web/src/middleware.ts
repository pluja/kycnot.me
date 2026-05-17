import { getActionContext, isInputError } from 'astro:actions'
import { defineMiddleware, sequence } from 'astro:middleware'

import { hashApiKey } from './lib/apiKey'
import { ErrorBanners, getMessagesFromUrl } from './lib/errorBanners'
import { getImpersonationInfo } from './lib/impersonation'
import { makeUserWithKarmaUnlocks } from './lib/karmaUnlocks'
import { prisma } from './lib/prisma'
import { makeLoginUrl, makeSafeRedirectUrl } from './lib/redirectUrls'
import { getRedisActionsSessions } from './lib/redis/redisActionsSessions'
import { siteOrigin } from './lib/urls'
import { getUserFromCookies } from './lib/userCookies'

const ACTION_SESSION_COOKIE = 'action-session-id'

function addActionBannerIfNeeded(
  context: Parameters<Parameters<typeof defineMiddleware>[0]>[0],
  error: Parameters<NonNullable<ReturnType<typeof getActionContext>['serializeActionResult']>>[0]['error']
) {
  if (!error || isInputError(error)) return

  context.locals.banners.add({
    uiMessage: error.message,
    type: 'error',
    origin: 'action',
    error,
  })
}

const preventFormResubmitAndStoreActionErrors = defineMiddleware(async (context, next) => {
  if (context.isPrerendered) return next()

  const { action, setActionResult, serializeActionResult } = getActionContext(context)

  const sessionId = context.cookies.get(ACTION_SESSION_COOKIE)?.value
  if (!sessionId && !action) return next()

  const redisActionsSessions = await getRedisActionsSessions()
  const session = await redisActionsSessions.get(sessionId)

  if (session) {
    setActionResult(session.actionName, session.actionResult)
    addActionBannerIfNeeded(context, session.deserializedActionResult.error)

    await redisActionsSessions.delete(sessionId)
    context.cookies.delete(ACTION_SESSION_COOKIE)
    return next()
  }

  if (action) {
    const actionResult = await action.handler()
    addActionBannerIfNeeded(context, actionResult.error)

    if (action.calledFrom === 'form') {
      const sessionId = await redisActionsSessions.store({
        actionName: action.name,
        actionResult: serializeActionResult(actionResult),
      })

      context.cookies.set(ACTION_SESSION_COOKIE, sessionId, {
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: redisActionsSessions.expirationTime,
      })

      if (actionResult.error) {
        const referer = context.request.headers.get('Referer')
        return context.redirect(
          referer ? makeSafeRedirectUrl(referer, siteOrigin) : context.originPathname
        )
      }
      return context.redirect(context.originPathname)
    }
  }

  return next()
})

const authenticate = defineMiddleware(async (context, next) => {
  const user = await getUserFromCookies(context.cookies)
  context.locals.user = makeUserWithKarmaUnlocks(user)

  return next()
})

const apiKeyAuth = defineMiddleware(async (context, next) => {
  context.locals.apiKeyAuthenticated = false

  if (!context.url.pathname.startsWith('/api/')) return next()

  const authHeader = context.request.headers.get('Authorization')
  const apiKeyHeader = context.request.headers.get('X-Api-Key')
  const rawKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : apiKeyHeader

  if (!rawKey) {
    return new Response(JSON.stringify({ error: 'API key required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const keyHash = hashApiKey(rawKey)
  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash, isActive: true },
  })

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Invalid API key' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  context.locals.apiKeyAuthenticated = true

  // Fire-and-forget lastUsedAt update
  prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch((error: unknown) => {
    void error
  })

  return next()
})

const impersonate = defineMiddleware(async (context, next) => {
  context.locals.actualUser = null

  const user = context.locals.user
  if (user?.admin) {
    const impersonationInfo = await getImpersonationInfo(context.cookies)

    if (impersonationInfo !== null && impersonationInfo.adminId === user.id) {
      const impersonatedUser = await prisma.user.findUnique({
        where: { id: impersonationInfo.targetId },
      })

      if (impersonatedUser) {
        context.locals.actualUser = user
        context.locals.user = makeUserWithKarmaUnlocks(impersonatedUser)
      }
    }
  }

  return next()
})

const protectRoutes = defineMiddleware(async (context, next) => {
  const user = context.locals.user

  if (context.url.pathname.startsWith('/admin')) {
    if (!user) {
      return context.redirect(
        makeLoginUrl(context.url, { message: 'Login as admin to access this page' })
      )
    }

    if (!user.admin) {
      const accessDeniedUrl = new URL('/access-denied', context.url)
      accessDeniedUrl.searchParams.set('reasonType', 'admin-required')
      accessDeniedUrl.searchParams.set('redirect', context.url.pathname + context.url.search)
      return context.redirect(accessDeniedUrl.pathname + accessDeniedUrl.search)
    }
  }

  return next()
})

const makeIds = defineMiddleware(async (context, next) => {
  const prefixCount = new Map<string, number>()

  context.locals.makeId = <T extends string>(prefix: T) => {
    const count = (prefixCount.get(prefix) ?? 0) + 1
    prefixCount.set(prefix, count)
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    return `${prefix}-${count}-${crypto.randomUUID()}` as const
  }

  return next()
})

const errors = defineMiddleware(async (context, next) => {
  const messagesFromUrl = getMessagesFromUrl(context)
  context.locals.banners = new ErrorBanners(messagesFromUrl)

  return next()
})

export const onRequest = sequence(
  errors,
  authenticate,
  apiKeyAuth,
  impersonate,
  protectRoutes,
  preventFormResubmitAndStoreActionErrors,
  makeIds
)
