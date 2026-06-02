import { getActionContext, isInputError } from 'astro:actions'
import { defineMiddleware, sequence } from 'astro:middleware'

import { hashApiKey } from './lib/apiKey'
import { ErrorBanners, getMessagesFromUrl } from './lib/errorBanners'
import { FORM_REPLAY_MARKER, FORM_REPLAY_MAX_CHARS, type ActionFormValues } from './lib/formReplay'
import { getImpersonationInfo } from './lib/impersonation'
import { makeUserWithKarmaUnlocks } from './lib/karmaUnlocks'
import { adminRouteRequiredCapability, userCan, userCanAccessAdmin } from './lib/permissions'
import { prisma } from './lib/prisma'
import { makeLoginUrl, makeSafeRedirectUrl } from './lib/redirectUrls'
import { getRedisActionsSessions } from './lib/redis/redisActionsSessions'
import { browserOriginForUrl, cookieSecureForUrl } from './lib/urls'
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

async function readSubmittedFormValues(request: Request): Promise<ActionFormValues | undefined> {
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return undefined
  }

  // Opt-in only (default-deny): forms without the marker, such as the login
  // and token-generation forms, are never persisted. This keeps credentials
  // out of the action session by construction rather than via a field denylist.
  if (formData.get(FORM_REPLAY_MARKER) !== '1') return undefined

  const values: ActionFormValues = {}
  let totalChars = 0
  for (const [key, value] of formData.entries()) {
    if (key === FORM_REPLAY_MARKER) continue
    if (typeof value !== 'string') continue // never persist File uploads
    totalChars += key.length + value.length
    if (totalChars > FORM_REPLAY_MAX_CHARS) return undefined // too large to persist
    const existing = values[key]
    if (existing === undefined) values[key] = value
    else if (Array.isArray(existing)) existing.push(value)
    else values[key] = [existing, value]
  }

  return Object.keys(values).length > 0 ? values : undefined
}

const preventFormResubmitAndStoreActionErrors = defineMiddleware(async (context, next) => {
  context.locals.actionFormValues = null

  if (context.isPrerendered) return next()

  const { action, setActionResult, serializeActionResult } = getActionContext(context)

  const sessionId = context.cookies.get(ACTION_SESSION_COOKIE)?.value
  if (!sessionId && !action) return next()

  const redisActionsSessions = await getRedisActionsSessions()
  const session = await redisActionsSessions.get(sessionId)

  if (session) {
    setActionResult(session.actionName, session.actionResult)
    addActionBannerIfNeeded(context, session.deserializedActionResult.error)
    context.locals.actionFormValues = session.formValues ?? null

    await redisActionsSessions.delete(sessionId)
    context.cookies.delete(ACTION_SESSION_COOKIE)
    return next()
  }

  if (action) {
    // Capture the submitted fields before the handler consumes the body, so a
    // re-rendered form (validation error, duplicate prompt, ...) can replay
    // them after the redirect. Success paths store them too but redirect away
    // without reading, so the cost is one extra parse per form submission.
    const requestCloneForReplay = action.calledFrom === 'form' ? context.request.clone() : null

    const actionResult = await action.handler()
    addActionBannerIfNeeded(context, actionResult.error)

    if (action.calledFrom === 'form') {
      const submittedFormValues = requestCloneForReplay
        ? await readSubmittedFormValues(requestCloneForReplay)
        : undefined

      // HTMX manages its own state via XHR. The PRG dance returns a 302
      // whose empty body HTMX swaps into the target, so the first click
      // looks like a no-op and the result only surfaces on the second
      // click (when the stored cookie is consumed). Render in place
      // instead and let HTMX swap the rendered partial directly.
      const isHtmx = context.request.headers.get('HX-Request') === 'true'
      if (isHtmx) {
        setActionResult(action.name, serializeActionResult(actionResult))
        context.locals.actionFormValues = submittedFormValues ?? null
        return next()
      }

      const sessionId = await redisActionsSessions.store({
        actionName: action.name,
        actionResult: serializeActionResult(actionResult),
        formValues: submittedFormValues,
      })

      context.cookies.set(ACTION_SESSION_COOKIE, sessionId, {
        path: '/',
        httpOnly: true,
        secure: cookieSecureForUrl(context.url),
        sameSite: 'strict',
        maxAge: redisActionsSessions.expirationTime,
      })

      if (actionResult.error) {
        // Re-render the submitted form. Prefer a same-origin referer (so forms
        // that post to a different page than they live on go back to the form),
        // but fall back to the posted-to path when the referer is missing or
        // fails the origin check (e.g. an http referer vs the https-normalised
        // origin in dev) instead of dropping the user on '/'.
        const referer = context.request.headers.get('Referer')
        const safeReferer = referer ? makeSafeRedirectUrl(referer, browserOriginForUrl(context.url)) : null
        return context.redirect(safeReferer && safeReferer !== '/' ? safeReferer : context.originPathname)
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

const bindCapabilities = defineMiddleware(async (context, next) => {
  context.locals.userCan = (capability) => userCan(context.locals.user, capability)
  return next()
})

const protectRoutes = defineMiddleware(async (context, next) => {
  const user = context.locals.user

  if (context.url.pathname.startsWith('/admin')) {
    if (!user) {
      return context.redirect(makeLoginUrl(context.url, { message: 'Login to access this page' }))
    }

    // The dashboard root is reachable by anyone with admin access (it only
    // renders the links they can use). Every other unmapped admin route is
    // superuser-only (default-deny).
    const isAdminRoot = context.url.pathname === '/admin' || context.url.pathname === '/admin/'
    const requiredCapability = adminRouteRequiredCapability(context.url.pathname)
    const granted = isAdminRoot
      ? userCanAccessAdmin(user)
      : requiredCapability
        ? userCan(user, requiredCapability)
        : user.admin

    if (!granted) {
      const accessDeniedUrl = new URL('/access-denied', context.url)
      accessDeniedUrl.searchParams.set(
        'reasonType',
        requiredCapability ? 'capability-required' : 'admin-required'
      )
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
  bindCapabilities,
  protectRoutes,
  preventFormResubmitAndStoreActionErrors,
  makeIds
)
