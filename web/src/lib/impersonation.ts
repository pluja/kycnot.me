import { getRedisImpersonationSessions } from './redis/redisImpersonationSessions'
import { cookieSecureForUrl } from './urls'

import type { APIContext, AstroCookies } from 'astro'

const IMPERSONATION_SESSION_COOKIE = 'impersonation_session_id'

export async function startImpersonating(
  context: Pick<APIContext, 'cookies' | 'locals' | 'url'>,
  adminUser: NonNullable<APIContext['locals']['actualUser']>,
  targetUser: NonNullable<APIContext['locals']['user']>
) {
  const redisImpersonationSessions = await getRedisImpersonationSessions()
  const sessionId = await redisImpersonationSessions.store({
    adminId: adminUser.id,
    targetId: targetUser.id,
  })

  context.cookies.set(IMPERSONATION_SESSION_COOKIE, sessionId, {
    path: '/',
    secure: cookieSecureForUrl(context.url),
    httpOnly: true,
    sameSite: 'strict',
    maxAge: redisImpersonationSessions.expirationTime,
  })
  context.locals.user = targetUser
  context.locals.actualUser = adminUser
}

export async function stopImpersonating(context: Pick<APIContext, 'cookies' | 'locals'>) {
  const sessionId = context.cookies.get(IMPERSONATION_SESSION_COOKIE)?.value
  if (sessionId) {
    const redisImpersonationSessions = await getRedisImpersonationSessions()
    await redisImpersonationSessions.delete(sessionId)
  }
  context.cookies.delete(IMPERSONATION_SESSION_COOKIE)
  context.locals.user = context.locals.actualUser ?? context.locals.user
  context.locals.actualUser = null
}

export async function getImpersonationInfo(cookies: AstroCookies) {
  const sessionId = cookies.get(IMPERSONATION_SESSION_COOKIE)?.value
  if (!sessionId) return null
  const redisImpersonationSessions = await getRedisImpersonationSessions()
  return redisImpersonationSessions.get(sessionId)
}
