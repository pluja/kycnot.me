import { stopImpersonating } from './impersonation'
import { prisma } from './prisma'
import { getRedisSessions } from './redis/redisSessions'

import type { APIContext, AstroCookies, AstroCookieSetOptions } from 'astro'

const COOKIE_NAME = 'user_session_id'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 1 week

const defaultCookieOptions = {
  path: '/',
  secure: true,
  httpOnly: true,
  sameSite: 'strict',
  maxAge: COOKIE_MAX_AGE,
} as const satisfies AstroCookieSetOptions

export function getUserSessionIdCookie(cookies: AstroCookies) {
  return cookies.get(COOKIE_NAME)?.value
}

export async function getUserFromCookies(cookies: AstroCookies) {
  const userSessionId = getUserSessionIdCookie(cookies)
  if (!userSessionId) return null

  const redisSessions = await getRedisSessions()
  const userSecretTokenHash = await redisSessions.getUserBySessionId(userSessionId)
  if (!userSecretTokenHash) return null

  return prisma.user.findFirst({
    where: {
      secretTokenHash: userSecretTokenHash,
    },
  })
}

export async function setUserSessionIdCookie(
  cookies: AstroCookies,
  userSecretTokenHash: string,
  options: AstroCookieSetOptions = {}
) {
  const redisSessions = await getRedisSessions()
  const sessId = await redisSessions.createSession(userSecretTokenHash)
  cookies.set(COOKIE_NAME, sessId, {
    ...defaultCookieOptions,
    ...options,
  })
}

export async function removeUserSessionIdCookie(cookies: AstroCookies) {
  const sessionId = cookies.get(COOKIE_NAME)?.value
  if (sessionId) {
    const redisSessions = await getRedisSessions()
    await redisSessions.deleteSession(sessionId)
  }
  cookies.delete(COOKIE_NAME, { path: '/' })
}

export async function logout(context: Pick<APIContext, 'cookies' | 'locals' | 'request' | 'url'>) {
  await stopImpersonating(context)

  await removeUserSessionIdCookie(context.cookies)

  context.locals.user = null
  context.locals.actualUser = null
}

export async function login(
  context: Pick<APIContext, 'cookies' | 'locals'>,
  user: NonNullable<APIContext['locals']['user']>
) {
  await stopImpersonating(context)

  await setUserSessionIdCookie(context.cookies, user.secretTokenHash)

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  })

  context.locals.user = user
  context.locals.actualUser = null
}
