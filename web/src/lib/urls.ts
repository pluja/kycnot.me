import { SITE_URL } from 'astro:env/client'
import { escapeRegExp } from 'lodash-es'

/**
 * Canonical site origin derived from the SITE_URL env variable.
 * Use instead of `Astro.url.origin` / `context.url.origin` which resolve to
 * the Docker-internal address (e.g. `http://localhost:4321`) when running
 * behind a reverse proxy.
 */
export const siteOrigin: string = new URL(SITE_URL).origin

/**
 * `.onion` and `.i2p` are served over plain HTTP (the hidden-service layer
 * provides confidentiality, not TLS). Browsers reject `Set-Cookie ...; Secure`
 * on HTTP responses, which silently kills sessions for Tor/I2P users. Caddy
 * terminates TLS for clearnet and reverse-proxies HTTP to Astro, so we can't
 * trust the upstream scheme either; infer from the requested hostname instead.
 */
export function cookieSecureForUrl(url: URL): boolean {
  return !url.hostname.endsWith('.onion') && !url.hostname.endsWith('.i2p')
}

/**
 * Reconstructs the origin the browser actually sees for the current request.
 * `context.url.origin` is always `http://...` inside the Docker network (Caddy
 * terminates TLS upstream); use this when matching against browser-supplied
 * values like Referer so onion/clearnet redirects don't fall back to `/`.
 */
export function browserOriginForUrl(url: URL): string {
  return `${cookieSecureForUrl(url) ? 'https' : 'http'}://${url.host}`
}

export function absoluteSiteUrl(path: string): string {
  return new URL(path, siteOrigin).href
}

export const createPageUrl = (
  page: number,
  currentUrl: URL | string,
  otherParams?: Record<string, string | null | undefined> | URLSearchParams
) => {
  const url = new URL(currentUrl)
  if (otherParams) {
    if (otherParams instanceof URLSearchParams) {
      otherParams.forEach((value, key) => {
        url.searchParams.set(key, value)
      })
    } else {
      Object.entries(otherParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, value)
        }
      })
    }
  }
  url.searchParams.set('page', page.toString())

  return url.pathname + url.search
}

export function urlParamsToFormData(params: URLSearchParams) {
  const formData = new FormData()
  params.forEach((value, key) => {
    formData.append(key, value)
  })
  return formData
}

export function urlParamsToObject(params: URLSearchParams) {
  return Object.fromEntries(params.entries())
}

export function urlWithParams(
  url: URL | string,
  params: Record<string, number[] | string[] | number | string | null | undefined>,
  { clearExisting }: { clearExisting?: boolean } = { clearExisting: false }
) {
  const urlObj = new URL(url)
  if (clearExisting) {
    const keysToDelete = Array.from(urlObj.searchParams.keys())
    keysToDelete.forEach((key) => {
      urlObj.searchParams.delete(key)
    })
  }
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((v) => {
        urlObj.searchParams.append(key, String(v))
      })
    } else if (value === null || value === undefined) {
      urlObj.searchParams.delete(key)
    } else {
      urlObj.searchParams.set(key, String(value))
    }
  })
  return urlObj.pathname + urlObj.search
}

export function makeObjectSearchParamKeyRegex(key: string) {
  return new RegExp(`^${escapeRegExp(key)}-(.*)$`)
}

/**
 * Parses the value of an object from a URL with zod. Assuming this format: `key[subkey]=value`
 *
 * Returns an object with the keys as the subkeys and the values as the values.
 * Or `undefined` if there are no subkeys.
 *
 * If there is no subkey (`key=value`), the subkey is set to an empty string.
 *
 * @example
 * ```ts
 * const searchParams = new URLSearchParams('tag-en=include&tag-fr=exclude&tag-es=')
 * const value = getObjectSearchParam(searchParams, 'tag')
 * // value: { en: 'include', fr: 'exclude'}
 * ```
 */
export function getObjectSearchParam(
  params: URLSearchParams,
  key: string,
  {
    ignoreEmptyValues = true,
    emptyObjectBecomesUndefined = true,
  }: {
    ignoreEmptyValues?: boolean
    emptyObjectBecomesUndefined?: boolean
  } = {}
) {
  const keyPattern = makeObjectSearchParamKeyRegex(key)

  const entries = Array.from(params.entries()).flatMap(([paramKey, paramValue]) => {
    if (ignoreEmptyValues && paramValue === '') return []
    if (paramKey === key) return [['', paramValue]] as const

    const subKey = paramKey.match(keyPattern)?.[1]
    if (subKey === undefined) return []
    return [[subKey, paramValue]] as const
  })

  if (entries.length === 0) return emptyObjectBecomesUndefined ? undefined : {}
  return Object.fromEntries(entries)
}

export function urlDomain(url: URL | string) {
  if (typeof url === 'string') {
    return url.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/(index\.html)?$/, '')
  }
  return url.origin
}

export function separateServiceUrlsByType(allServiceUrls: string[]) {
  const result: {
    web: string[]
    onion: string[]
    i2p: string[]
  } = {
    web: [],
    onion: [],
    i2p: [],
  }

  for (const url of allServiceUrls) {
    const parsedUrl = new URL(url)
    if (parsedUrl.origin.endsWith('.onion')) {
      result.onion.push(url)
    } else if (parsedUrl.origin.endsWith('.b32.i2p')) {
      result.i2p.push(url)
    } else {
      result.web.push(url)
    }
  }

  return result
}

/**
 * The current address with some filters changed, for a feed whose filters are
 * plain links.
 *
 * Drops the parameters that describe where a reader is in the feed rather than
 * what they are looking at: the page, the day the last page ended on, and the
 * text typed into a service picker. Carrying those into a filter link pins the
 * picker open over the page and hides the heading the feed opens with.
 */
export function makeFilterUrl(currentUrl: URL, changes: Record<string, string | undefined>) {
  const url = new URL(currentUrl)
  for (const key of ['page', 'after', 'serviceQuery']) url.searchParams.delete(key)
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) url.searchParams.delete(key)
    else url.searchParams.set(key, value)
  }
  return `${url.pathname}${url.search}`
}
