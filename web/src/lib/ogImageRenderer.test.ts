import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createElement } from 'react'

import sharp from 'sharp'

import { createOgImageAssetLoader } from './ogImageAssetLoader'
import { defaultOgImageRenderOptions, renderOgImage } from './ogImageRenderer'

void test('renders a PNG without loading Greek or Cyrillic fonts from the network', async () => {
  let fetchRequests = 0
  const title = 'Привет κόσμε'
  const response = await renderOgImage(
    createElement('div', { style: { display: 'flex', fontFamily: 'Space Grotesk', fontWeight: 700 } }, title),
    {
      ...defaultOgImageRenderOptions,
      loadAdditionalAsset: createOgImageAssetLoader({
        fetchAsset: () => {
          fetchRequests++
          return Promise.reject(new Error('unexpected network request'))
        },
      }),
    }
  )
  const bytes = Buffer.from(await response.arrayBuffer())
  const metadata = await sharp(bytes).metadata()

  assert.equal(response.headers.get('Content-Type'), 'image/png')
  assert.equal(metadata.width, 1200)
  assert.equal(metadata.height, 630)
  assert.equal(fetchRequests, 0)
})
