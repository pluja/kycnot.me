import assert from 'node:assert/strict'
import { test } from 'node:test'

import { reportMissingAsset, trackMissingAssets } from './missingAssets'

void test('reports a clean render', async () => {
  const { result, missingAssets } = await trackMissingAssets(() => Promise.resolve('card'))

  assert.equal(result, 'card')
  assert.equal(missingAssets, false)
})

void test('reports a render that lost an asset', async () => {
  const { result, missingAssets } = await trackMissingAssets(async () => {
    await Promise.resolve()
    reportMissingAsset()
    return 'card'
  })

  assert.equal(result, 'card')
  assert.equal(missingAssets, true)
})

void test('sees a report from deep inside the render', async () => {
  const loadIcon = async () => {
    await Promise.resolve()
    reportMissingAsset()
  }
  const { missingAssets } = await trackMissingAssets(async () => {
    await Promise.all([loadIcon(), Promise.resolve()])
    return 'card'
  })

  assert.equal(missingAssets, true)
})

void test('keeps concurrent renders independent', async () => {
  let releaseClean: () => void = () => undefined
  const clean = trackMissingAssets(async () => {
    await new Promise<void>((resolve) => {
      releaseClean = resolve
    })
    return 'clean'
  })
  const degraded = trackMissingAssets(async () => {
    await Promise.resolve()
    reportMissingAsset()
    return 'degraded'
  })

  assert.equal((await degraded).missingAssets, true)
  releaseClean()
  assert.equal((await clean).missingAssets, false)
})

void test('propagates a render that throws', async () => {
  await assert.rejects(
    trackMissingAssets(() => Promise.reject(new Error('boom'))),
    /boom/
  )
})

void test('ignores a report outside a tracked render', () => {
  assert.doesNotThrow(() => {
    reportMissingAsset()
  })
})
