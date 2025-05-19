import { redisImpersonationSessions } from './redis/redisImpersonationSessions'

import type { APIContext, AstroCookies } from 'astro'

const IMPERSONATION_SESSION_COOKIE = 'impersonation_session_id'

export async function startImpersonating(
  context: Pick<APIContext, 'cookies' | 'locals'>,
  adminUser: NonNullable<APIContext['locals']['actualUser']>,
  targetUser: NonNullable<APIContext['locals']['user']>
) {
  const sessionId = await redisImpersonationSessions.store({
    adminId: adminUser.id,
    targetId: targetUser.id,
  })

  context.cookies.set(IMPERSONATION_SESSION_COOKIE, sessionId, {
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'strict',
    maxAge: redisImpersonationSessions.expirationTime,
  })
  context.locals.user = targetUser
  context.locals.actualUser = adminUser
}

export async function stopImpersonating(context: Pick<APIContext, 'cookies' | 'locals'>) {
  const sessionId = context.cookies.get(IMPERSONATION_SESSION_COOKIE)?.value
  await redisImpersonationSessions.delete(sessionId)
  context.cookies.delete(IMPERSONATION_SESSION_COOKIE)
  context.locals.user = context.locals.actualUser
  context.locals.actualUser = null
}

export async function getImpersonationInfo(cookies: AstroCookies) {
  const sessionId = cookies.get(IMPERSONATION_SESSION_COOKIE)?.value
  return await redisImpersonationSessions.get(sessionId)
}
