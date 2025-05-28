import { escapeRegExp } from 'lodash-es'

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

  return url.toString()
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
  return urlObj.toString()
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
