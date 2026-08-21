import { createHash } from 'node:crypto'

import { LruByteCache } from './lruByteCache'
import { reportMissingAsset } from './missingAssets'

import type { Font, Locale, SatoriOptions } from 'satori'

export const OG_IMAGE_ASSET_LIMITS = {
  timeoutMs: 3000,
  emojiBytes: 256 * 1024,
  fontCssBytes: 64 * 1024,
  fontBytes: 2 * 1024 * 1024,
  failureCacheMs: 5 * 60 * 1000,
} as const

const TWEMOJI_BASE_URL = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/'
type SatoriFontCode = Locale | 'math' | 'symbol'

const FONT_FAMILIES = {
  'ja-JP': ['Noto+Sans+JP'],
  'ko-KR': ['Noto+Sans+KR'],
  'zh-CN': ['Noto+Sans+SC'],
  'zh-TW': ['Noto+Sans+TC'],
  'zh-HK': ['Noto+Sans+HK'],
  'th-TH': ['Noto+Sans+Thai'],
  'bn-IN': ['Noto+Sans+Bengali'],
  'ar-AR': ['Noto+Sans+Arabic'],
  'ta-IN': ['Noto+Sans+Tamil'],
  'ml-IN': ['Noto+Sans+Malayalam'],
  'he-IL': ['Noto+Sans+Hebrew'],
  'te-IN': ['Noto+Sans+Telugu'],
  devanagari: ['Noto+Sans+Devanagari'],
  kannada: ['Noto+Sans+Kannada'],
  symbol: ['Noto+Sans+Symbols', 'Noto+Sans+Symbols+2'],
  math: ['Noto+Sans+Math'],
} satisfies Record<SatoriFontCode, string[]>

type OgImageAsset = Font[] | string
type FetchAsset = (input: URL | string, init?: RequestInit) => Promise<Response>
type FontRequest = { code: SatoriFontCode; family: string }
type OgImageAssetRequest = { type: 'emoji' } | { type: 'fonts'; fontRequests: FontRequest[] }

type OgImageAssetLoaderOptions = {
  fetchAsset?: FetchAsset
  now?: () => number
  timeoutMs?: number
}

type BoundedFetchOptions = {
  allowedHost: string
  contentTypes: Set<string>
  headers?: HeadersInit
  maxBytes: number
  signal: AbortSignal
}

export function createOgImageAssetLoader({
  fetchAsset = async (input, init) => await fetch(input, init),
  now = Date.now,
  timeoutMs = OG_IMAGE_ASSET_LIMITS.timeoutMs,
}: OgImageAssetLoaderOptions = {}): NonNullable<SatoriOptions['loadAdditionalAsset']> {
  const assetCache = new LruByteCache<OgImageAsset>(32 * 1024 * 1024, 4 * 1024 * 1024)
  const failureCache = new LruByteCache<number>(256, 1)
  const pending = new Map<string, Promise<OgImageAsset>>()

  return async (languageCode, segment) => {
    const assetRequest: OgImageAssetRequest =
      languageCode === 'emoji'
        ? { type: 'emoji' }
        : { type: 'fonts', fontRequests: getFontRequests(languageCode) }
    // A script with no mapped family renders as tofu no matter how often it is
    // retried, so it must not reach reportMissingAsset: that would hold every
    // card carrying it out of the render cache forever.
    if (assetRequest.type === 'fonts' && assetRequest.fontRequests.length === 0) return []

    const key = assetKey(languageCode, segment)
    const cached = assetCache.get(key)
    if (cached !== undefined) return cached

    const failedUntil = failureCache.get(key)
    if (failedUntil !== undefined && failedUntil > now()) {
      reportMissingAsset()
      return []
    }

    let task = pending.get(key)
    if (!task) {
      task = loadAndCacheAsset(segment, key, assetRequest)
      pending.set(key, task)
    }

    const asset = await task
    if (isEmptyAsset(asset)) reportMissingAsset()
    return asset
  }

  async function loadAndCacheAsset(segment: string, key: string, assetRequest: OgImageAssetRequest) {
    try {
      const asset =
        assetRequest.type === 'emoji'
          ? await loadEmoji(segment, fetchAsset, timeoutMs)
          : await loadFonts(assetRequest.fontRequests, segment, fetchAsset, timeoutMs)
      if (isEmptyAsset(asset)) {
        failureCache.set(key, now() + OG_IMAGE_ASSET_LIMITS.failureCacheMs, 1)
      } else {
        assetCache.set(key, asset, assetBytes(asset))
      }
      return asset
    } catch {
      failureCache.set(key, now() + OG_IMAGE_ASSET_LIMITS.failureCacheMs, 1)
      return []
    } finally {
      pending.delete(key)
    }
  }
}

export const loadOgImageAsset = createOgImageAssetLoader()

async function loadEmoji(segment: string, fetchAsset: FetchAsset, timeoutMs: number): Promise<string> {
  const signal = AbortSignal.timeout(timeoutMs)
  const bytes = await fetchBytes(`${TWEMOJI_BASE_URL}${emojiCode(segment)}.svg`, fetchAsset, {
    allowedHost: 'cdn.jsdelivr.net',
    contentTypes: new Set(['image/svg+xml']),
    maxBytes: OG_IMAGE_ASSET_LIMITS.emojiBytes,
    signal,
  })
  return `data:image/svg+xml;base64,${Buffer.from(bytes).toString('base64')}`
}

async function loadFonts(
  requests: FontRequest[],
  segment: string,
  fetchAsset: FetchAsset,
  timeoutMs: number
): Promise<Font[]> {
  const fonts = await Promise.all(
    requests.map(async ({ code, family }) => {
      try {
        return await loadGoogleFont(code, family, segment, fetchAsset, timeoutMs)
      } catch {
        return null
      }
    })
  )
  return fonts.filter((font): font is Font => font !== null)
}

function getFontRequests(languageCode: string): FontRequest[] {
  return languageCode
    .split('|')
    .flatMap((code) =>
      isSatoriFontCode(code) ? FONT_FAMILIES[code].map((family) => ({ code, family })) : []
    )
}

function isSatoriFontCode(code: string): code is SatoriFontCode {
  return Object.hasOwn(FONT_FAMILIES, code)
}

async function loadGoogleFont(
  languageCode: string,
  family: string,
  segment: string,
  fetchAsset: FetchAsset,
  timeoutMs: number
): Promise<Font> {
  const signal = AbortSignal.timeout(timeoutMs)
  const cssBytes = await fetchBytes(
    `https://fonts.googleapis.com/css2?family=${family}&text=${encodeURIComponent(segment)}`,
    fetchAsset,
    {
      allowedHost: 'fonts.googleapis.com',
      contentTypes: new Set(['text/css']),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1',
      },
      maxBytes: OG_IMAGE_ASSET_LIMITS.fontCssBytes,
      signal,
    }
  )
  const css = Buffer.from(cssBytes).toString('utf8')
  const resource =
    /src:\s*url\(["']?(https:\/\/[^"')]+)["']?\)\s*format\(["'](?:opentype|truetype)["']\)/.exec(css)
  if (!resource?.[1]) throw new Error('Font CSS contained no TrueType resource')

  const fontBytes = await fetchBytes(resource[1], fetchAsset, {
    allowedHost: 'fonts.gstatic.com',
    contentTypes: new Set(['application/octet-stream', 'application/x-font-ttf', 'font/ttf']),
    maxBytes: OG_IMAGE_ASSET_LIMITS.fontBytes,
    signal,
  })
  return {
    name: `OG ${family.replaceAll('+', ' ')}`,
    data: Buffer.from(fontBytes),
    weight: 400,
    style: 'normal',
    lang: languageCode,
  }
}

async function fetchBytes(
  url: string,
  fetchAsset: FetchAsset,
  options: BoundedFetchOptions
): Promise<Uint8Array> {
  assertAllowedUrl(url, options.allowedHost)
  const response = await fetchAsset(url, {
    headers: options.headers,
    redirect: 'manual',
    signal: options.signal,
  })
  if (!response.ok) throw new Error(`Asset request failed with ${String(response.status)}`)
  if (response.url) assertAllowedUrl(response.url, options.allowedHost)

  const contentType = response.headers.get('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (!contentType || !options.contentTypes.has(contentType)) {
    throw new Error('Asset response had an unsupported content type')
  }
  const contentLength = Number(response.headers.get('Content-Length'))
  if (Number.isFinite(contentLength) && contentLength > options.maxBytes) {
    throw new Error('Asset response exceeded the byte limit')
  }
  if (!response.body) throw new Error('Asset response had no body')

  const chunks: Uint8Array[] = []
  let totalBytes = 0
  const reader = response.body.getReader()
  let chunk = await reader.read()
  while (!chunk.done) {
    totalBytes += chunk.value.byteLength
    if (totalBytes > options.maxBytes) {
      await reader.cancel()
      throw new Error('Asset response exceeded the byte limit')
    }
    chunks.push(chunk.value)
    chunk = await reader.read()
  }

  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

function assertAllowedUrl(value: string, allowedHost: string): void {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.hostname !== allowedHost) {
    throw new Error('Asset URL was outside the allowlist')
  }
}

function emojiCode(value: string): string {
  const normalized = value.includes('\u200d') ? value : value.replaceAll('\ufe0f', '')
  return Array.from(normalized, codePointHex).join('-')
}

function codePointHex(character: string): string {
  const codePoint = character.codePointAt(0)
  if (codePoint === undefined) throw new Error('Cannot encode an empty emoji segment')
  return codePoint.toString(16)
}

function assetKey(languageCode: string, segment: string): string {
  return createHash('sha1').update(languageCode).update('\0').update(segment).digest('base64url')
}

function assetBytes(asset: OgImageAsset): number {
  if (typeof asset === 'string') return Buffer.byteLength(asset)
  return asset.reduce((total, font) => total + font.data.byteLength, 0)
}

function isEmptyAsset(asset: OgImageAsset): boolean {
  return Array.isArray(asset) && asset.length === 0
}
