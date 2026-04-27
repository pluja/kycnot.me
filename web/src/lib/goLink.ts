// The destination URL is passed verbatim as a URL-encoded `?to=` param so
// it stays human-readable in the address bar. Encoding adds nothing on top
// of the hostname allowlist and only obscures where the user is being sent.

export const normalizeHost = (raw: string): string | null => {
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    return u.hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}

// The leading dot in the suffix match is load-bearing: without it,
// `evil-realservice.com` would match `realservice.com`.
export const isAllowedHost = (destHost: string, allowedHosts: readonly string[]): boolean =>
  allowedHosts.some((allowed) => destHost === allowed || destHost.endsWith('.' + allowed))

const CURRENCY_PARAM_RE = /^[A-Za-z0-9@._-]{1,32}$/

export const isValidCurrencyParam = (v: string): boolean => CURRENCY_PARAM_RE.test(v)

export type BuildGoHrefArgs = {
  slug: string
  deepLinkUrl: string
  from?: string
  to?: string
}

export const buildGoHref = ({ slug, deepLinkUrl, from, to }: BuildGoHrefArgs): string => {
  const params = new URLSearchParams()
  params.set('to', deepLinkUrl)
  if (from && isValidCurrencyParam(from)) params.set('from', from)
  if (to && isValidCurrencyParam(to)) params.set('to_ccy', to)
  return `/go/${encodeURIComponent(slug)}?${params.toString()}`
}
