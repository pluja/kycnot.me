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

/**
 * Returns a relative path (`/account/login?...`) rather than an absolute URL so
 * the browser stays on whatever origin the user is currently on (clearweb, Tor
 * .onion, or I2P). Hardcoding the origin would push Tor/I2P visitors to the
 * clearweb domain on every auth redirect.
 */
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
  const loginUrl = new URL('/account/login', currentUrl)

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
  const redirectUrl = new URL(redirect || currentUrl, currentUrl)
  if (redirectUrl.pathname === '/account/login') {
    const redirectUrlRedirectParam = redirectUrl.searchParams.get('redirect')
    if (redirectUrlRedirectParam) {
      loginUrl.searchParams.set('redirect', redirectUrlRedirectParam)
    }
  } else {
    loginUrl.searchParams.set('redirect', redirectUrl.pathname + redirectUrl.search)
  }

  return loginUrl.pathname + loginUrl.search
}

export function makeUnimpersonateUrl(
  currentUrl: URL,
  {
    redirect,
  }: {
    redirect?: URL | string | null
  } = {}
) {
  const url = new URL('/account/impersonate', currentUrl)
  url.searchParams.set('stop', 'true')

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const redirectUrl = new URL(redirect || currentUrl, currentUrl)
  url.searchParams.set('redirect', redirectUrl.pathname + redirectUrl.search)

  return url.pathname + url.search
}
