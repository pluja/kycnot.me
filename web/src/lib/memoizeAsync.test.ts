import assert from 'node:assert/strict'
import { test } from 'node:test'

import { memoizeAsync } from './memoizeAsync'

void test('runs compute once and reuses the result', async () => {
  let runs = 0
  const value = memoizeAsync(() => {
    runs += 1
    return Promise.resolve(runs)
  })

  assert.equal(await value(), 1)
  assert.equal(await value(), 1)
  assert.equal(runs, 1)
})

void test('shares one run between concurrent callers', async () => {
  let runs = 0
  let finishRun: (bytes: string) => void = () => undefined
  const value = memoizeAsync(() => {
    runs += 1
    return new Promise<string>((resolve) => {
      finishRun = resolve
    })
  })

  const waiting = Promise.all([value(), value(), value()])
  finishRun('rendered')

  assert.deepEqual(await waiting, ['rendered', 'rendered', 'rendered'])
  assert.equal(runs, 1)
})

void test('rejects every caller waiting on a failed run', async () => {
  let runs = 0
  const value = memoizeAsync(() => {
    runs += 1
    return Promise.reject(new Error('boom'))
  })

  const settled = await Promise.allSettled([value(), value()])

  assert.deepEqual(
    settled.map((result) => result.status),
    ['rejected', 'rejected']
  )
  assert.equal(runs, 1)
})

void test('does not keep a rejection, so a later call retries', async () => {
  let runs = 0
  const value = memoizeAsync(() => {
    runs += 1
    return runs === 1 ? Promise.reject(new Error('boom')) : Promise.resolve('rendered')
  })

  await assert.rejects(value(), /boom/)
  assert.equal(await value(), 'rendered')
  assert.equal(runs, 2)
})

void test('reports a compute that throws before returning a promise', async () => {
  let runs = 0
  const value = memoizeAsync(() => {
    runs += 1
    if (runs === 1) throw new Error('boom')
    return Promise.resolve('rendered')
  })

  await assert.rejects(value(), /boom/)
  assert.equal(await value(), 'rendered')
})
