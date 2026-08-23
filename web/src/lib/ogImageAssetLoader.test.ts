import assert from 'node:assert/strict'
import { test } from 'node:test'

import { trackMissingAssets } from './missingAssets'
import { createOgImageAssetLoader } from './ogImageAssetLoader'

function mockGoogleFontResponse(input: URL | string): Response {
  if (String(input).startsWith('https://fonts.googleapis.com/')) {
    return new Response("@font-face { src: url(https://fonts.gstatic.com/s/test.ttf) format('truetype'); }", {
      headers: { 'Content-Type': 'text/css' },
    })
  }
  return new Response(new Uint8Array([0, 1, 2, 3]), {
    headers: { 'Content-Type': 'font/ttf' },
  })
}

void test('loads each segment once with an abort signal and caches it', async () => {
  const signals: AbortSignal[] = []
  let requests = 0
  const loadAsset = createOgImageAssetLoader({
    fetchAsset: (input, init) => {
      requests++
      assert.ok(init?.signal)
      signals.push(init.signal)
      return Promise.resolve(mockGoogleFontResponse(input))
    },
  })

  const first = await loadAsset('ar-AR', 'مرحبا')
  const second = await loadAsset('ar-AR', 'مرحبا')

  assert.equal(requests, 2)
  assert.equal(signals.length, 2)
  assert.equal(second, first)
  assert.equal(Array.isArray(first) ? first.length : 0, 1)
})

void test('shares one in-flight request per segment', async () => {
  let requests = 0
  let resolveResponse: (response: Response) => void = () => undefined
  const loadAsset = createOgImageAssetLoader({
    fetchAsset: async () => {
      requests++
      return await new Promise<Response>((resolve) => {
        resolveResponse = resolve
      })
    },
  })

  const first = loadAsset('ar-AR', 'مرحبا')
  const second = loadAsset('ar-AR', 'مرحبا')
  assert.equal(requests, 1)

  resolveResponse(new Response('no font-face here', { headers: { 'Content-Type': 'text/css' } }))
  const results = await Promise.all([first, second])
  assert.equal(results[0], results[1])
})

void test('aborts a stalled asset request and negative-caches the failure', async () => {
  let requests = 0
  const loadAsset = createOgImageAssetLoader({
    timeoutMs: 10,
    fetchAsset: async (_input, init) => {
      requests++
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => {
            reject(new Error('aborted', { cause: init.signal?.reason }))
          },
          { once: true }
        )
      })
    },
  })

  const first = await trackMissingAssets(() => loadAsset('ar-AR', 'مرحبا'))
  const second = await trackMissingAssets(() => loadAsset('ar-AR', 'مرحبا'))
  assert.deepEqual(first, { result: [], missingAssets: true })
  assert.deepEqual(second, { result: [], missingAssets: true })
  assert.equal(requests, 1)
})

void test('keeps an unmapped script cacheable and off the network', async () => {
  let requests = 0
  const loadAsset = createOgImageAssetLoader({
    fetchAsset: () => {
      requests++
      return Promise.reject(new Error('unexpected network request'))
    },
  })

  const loaded = await trackMissingAssets(() => loadAsset('unknown', 'Բարեւ'))

  assert.deepEqual(loaded, { result: [], missingAssets: false })
  assert.equal(requests, 0)
})

void test('loads mapped families from a compound language code', async () => {
  const requests: string[] = []
  const loadAsset = createOgImageAssetLoader({
    fetchAsset: (input) => {
      const url = String(input)
      requests.push(url)
      return Promise.resolve(mockGoogleFontResponse(input))
    },
  })

  const result = await trackMissingAssets(() => loadAsset('ja-JP|zh-CN|zh-TW|zh-HK', '漢'))

  assert.equal(result.missingAssets, false)
  assert.equal(Array.isArray(result.result) ? result.result.length : 0, 4)
  assert.equal(requests.length, 8)
})

void test('reports and negative-caches a failed mapped font load', async () => {
  let requests = 0
  const loadAsset = createOgImageAssetLoader({
    fetchAsset: () => {
      requests++
      return Promise.reject(new Error('font service unavailable'))
    },
  })

  const first = await trackMissingAssets(() => loadAsset('ar-AR', 'مرحبا'))
  const second = await trackMissingAssets(() => loadAsset('ar-AR', 'مرحبا'))

  assert.deepEqual(first, { result: [], missingAssets: true })
  assert.deepEqual(second, { result: [], missingAssets: true })
  assert.equal(requests, 1)
})

void test('loads a fallback font through bounded Google requests', async () => {
  const requests: { init?: RequestInit; url: string }[] = []
  const loadAsset = createOgImageAssetLoader({
    fetchAsset: (input, init) => {
      const url = String(input)
      requests.push({ url, init })
      return Promise.resolve(mockGoogleFontResponse(input))
    },
  })

  const fonts = await loadAsset('ar-AR', 'مرحبا')

  assert.equal(requests.length, 2)
  assert.ok(requests.every(({ init }) => init?.signal instanceof AbortSignal))
  assert.equal(Array.isArray(fonts), true)
  assert.equal(Array.isArray(fonts) ? fonts.length : 0, 1)
  assert.equal(Array.isArray(fonts) ? fonts[0]?.name : undefined, 'OG Noto Sans Arabic')
})

void test('rejects oversized asset responses', async () => {
  const loadAsset = createOgImageAssetLoader({
    fetchAsset: () =>
      Promise.resolve(
        new Response('@font-face {}', {
          headers: {
            'Content-Length': '9999999',
            'Content-Type': 'text/css',
          },
        })
      ),
  })

  assert.deepEqual(await loadAsset('ar-AR', 'مرحبا'), [])
})

void test('rejects a font resource served from outside the allowlist', async () => {
  const loadAsset = createOgImageAssetLoader({
    fetchAsset: () =>
      Promise.resolve(
        new Response("@font-face { src: url(https://evil.tld/f.ttf) format('truetype'); }", {
          headers: { 'Content-Type': 'text/css' },
        })
      ),
  })

  assert.deepEqual(await loadAsset('ar-AR', 'مرحبا'), [])
})
