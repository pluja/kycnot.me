import { getActionContext } from 'astro:actions'
import { defineMiddleware, sequence } from 'astro:middleware'

import { ErrorBanners, getMessagesFromUrl } from './lib/errorBanners'
import { getImpersonationInfo } from './lib/impersonation'
import { makeUserWithKarmaUnlocks } from './lib/karmaUnlocks'
import { prisma } from './lib/prisma'
import { makeLoginUrl } from './lib/redirectUrls'
import { redisActionsSessions } from './lib/redis/redisActionsSessions'
import { getUserFromCookies } from './lib/userCookies'

const ACTION_SESSION_COOKIE = 'action-session-id'

const preventFormResubmitAndStoreActionErrors = defineMiddleware(async (context, next) => {
  if (context.isPrerendered) return next()

  const { action, setActionResult, serializeActionResult } = getActionContext(context)

  const sessionId = context.cookies.get(ACTION_SESSION_COOKIE)?.value
  const session = await redisActionsSessions.get(sessionId)

  if (session) {
    setActionResult(session.actionName, session.actionResult)

    if (session.deserializedActionResult.error) {
      context.locals.banners.add({
        uiMessage: session.deserializedActionResult.error.message,
        type: 'error',
        origin: 'action',
        error: session.deserializedActionResult.error,
      })
    }

    await redisActionsSessions.delete(sessionId)
    context.cookies.delete(ACTION_SESSION_COOKIE)
    return next()
  }

  if (action) {
    const actionResult = await action.handler()

    if (actionResult.error) {
      context.locals.banners.add({
        uiMessage: actionResult.error.message,
        type: 'error',
        origin: 'action',
        error: actionResult.error,
      })
    }

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
        if (!referer) {
          throw new Error('Internal: Referer unexpectedly missing from Action POST request.')
        }
        return context.redirect(referer)
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

const impersonate = defineMiddleware(async (context, next) => {
  context.locals.actualUser = null

  const user = context.locals.user
  if (user?.admin) {
    const impersonationInfo = await getImpersonationInfo(context.cookies)

    if (impersonationInfo && impersonationInfo.adminId === user.id) {
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
      return Response.redirect(makeLoginUrl(context.url, { message: 'Login as admin to access this page' }))
    }

    if (!user.admin) {
      const accessDeniedUrl = new URL(context.url.origin)
      accessDeniedUrl.pathname = '/access-denied'
      accessDeniedUrl.searchParams.set('reasonType', 'admin-required')
      accessDeniedUrl.searchParams.set('redirect', context.url.toString())
      return Response.redirect(accessDeniedUrl.toString())
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
  impersonate,
  protectRoutes,
  preventFormResubmitAndStoreActionErrors,
  makeIds
)
