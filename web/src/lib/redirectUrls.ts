/**
 * Validates that a redirect URL is same-origin, returning '/' if not.
 * Prevents open redirect attacks via user-controlled Referer/redirect inputs.
 */
export function makeSafeRedirectUrl(url: string | null | undefined, origin: string): string {
  if (!url) return '/'
  try {
    const parsed = new URL(url, origin)
    if (parsed.origin !== origin) return '/'
    return parsed.pathname + parsed.search + parsed.hash
  } catch {
    return '/'
  }
}

export function makeLoginUrl(
  currentUrl: URL,
  {
    redirect,
    error,
    logout,
    message,
  }: {
    redirect?: URL | string | null
    error?: string | null
    logout?: boolean
    message?: string | null
  } = {}
) {
  const loginUrl = new URL(currentUrl.origin)
  loginUrl.pathname = '/account/login'

  if (error) {
    loginUrl.searchParams.set('error', error)
  }

  if (logout) {
    loginUrl.searchParams.set('logout', 'true')
  }

  if (message) {
    loginUrl.searchParams.set('message', message)
  }

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const redirectUrl = new URL(redirect || currentUrl)
  if (redirectUrl.pathname === '/account/login') {
    const redirectUrlRedirectParam = redirectUrl.searchParams.get('redirect')
    if (redirectUrlRedirectParam) {
      loginUrl.searchParams.set('redirect', redirectUrlRedirectParam)
    }
  } else {
    loginUrl.searchParams.set('redirect', redirectUrl.toString())
  }

  return loginUrl.toString()
}

export function makeUnimpersonateUrl(
  currentUrl: URL,
  {
    redirect,
  }: {
    redirect?: URL | string | null
  } = {}
) {
  const url = new URL(currentUrl.origin)
  url.pathname = '/account/impersonate'
  url.searchParams.set('stop', 'true')

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const redirectUrl = new URL(redirect || currentUrl)
  url.searchParams.set('redirect', redirectUrl.toString())

  return url.toString()
}
