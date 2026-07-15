import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Semaphore } from './semaphore'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

test('runs work up to the concurrency limit immediately', async () => {
  const semaphore = new Semaphore(2, 10)
  let running = 0
  let peak = 0
  const gate = deferred<void>()

  const work = () => {
    running++
    peak = Math.max(peak, running)
    return gate.promise.then(() => {
      running--
    })
  }

  const first = semaphore.run(work)
  const second = semaphore.run(work)
  const third = semaphore.run(work)
  assert.equal(peak, 2)

  gate.resolve()
  await Promise.all([first, second, third])
  assert.equal(peak, 2)
  assert.equal(running, 0)
})

test('returns null when the wait queue is full', async () => {
  const semaphore = new Semaphore(1, 1)
  const gate = deferred<void>()

  const first = semaphore.run(() => gate.promise)
  const queued = semaphore.run(() => gate.promise)
  const shed = semaphore.run(() => gate.promise)

  assert.notEqual(first, null)
  assert.notEqual(queued, null)
  assert.equal(shed, null)

  gate.resolve()
  await Promise.all([first, queued])
})

test('queued work runs after a slot frees and results propagate', async () => {
  const semaphore = new Semaphore(1, 5)
  const gate = deferred<void>()

  const first = semaphore.run(() => gate.promise.then(() => 'first'))
  const second = semaphore.run(async () => 'second')
  gate.resolve()
  assert.equal(await first, 'first')
  assert.equal(await second, 'second')
})

test('a rejection releases the slot and propagates to the caller', async () => {
  const semaphore = new Semaphore(1, 5)

  const failing = semaphore.run(async () => {
    throw new Error('boom')
  })
  const following = semaphore.run(async () => 'ok')

  await assert.rejects(failing!, /boom/)
  assert.equal(await following, 'ok')
})
