import assert from 'node:assert/strict'
import { test } from 'node:test'

import sharp from 'sharp'

import imageService from './imageService'
import { MAX_IMAGE_PIXELS } from './imageUpload'

const config = { service: { entrypoint: '', config: { limitInputPixels: MAX_IMAGE_PIXELS } } } as never

const transformTo = async (input: Buffer, width?: number, height?: number) => {
  const { data } = await imageService.transform(
    new Uint8Array(input),
    { src: 'test.png', width, height, format: 'webp' } as never,
    config
  )
  return sharp(data).metadata()
}

void test('a request never upscales the source', async () => {
  const source = await sharp({ create: { width: 200, height: 100, channels: 3, background: '#fff' } })
    .png()
    .toBuffer()
  const wide = await transformTo(source, 2400)
  assert.equal(wide.width, 200)
  const widthAndHeight = await transformTo(source, 800, 800)
  assert.equal(widthAndHeight.width, 200)
  assert.equal(widthAndHeight.height, 100)
  const heightOnly = await transformTo(source, undefined, 800)
  assert.equal(heightOnly.height, 100)
  const smaller = await transformTo(source, 100)
  assert.equal(smaller.width, 100)
})

void test('a wide banner keeps its aspect within the requested width', async () => {
  const banner = await sharp({ create: { width: 1500, height: 200, channels: 3, background: '#fff' } })
    .png()
    .toBuffer()
  const output = await transformTo(banner, 1200, 1200)
  assert.equal(output.width, 1200)
  assert.equal(output.height, 160)
})

void test('a very tall source is scaled to fit the output box', async () => {
  const tall = await sharp({ create: { width: 400, height: 8000, channels: 3, background: '#fff' } })
    .png()
    .toBuffer()
  const output = await transformTo(tall, 400)
  assert.equal(output.height, 2560)
  assert.equal(output.width, 128)
})

void test('an SVG is rendered sharp but within its smaller box', async () => {
  const smallLogo = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="64"><rect width="16" height="64"/></svg>'
  )
  assert.equal((await transformTo(smallLogo, 64)).width, 64)
  const largeLogo = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000"><rect width="1000" height="1000"/></svg>'
  )
  const huge = await transformTo(largeLogo, 4096)
  assert.equal(huge.width, 1024)
  assert.equal(huge.height, 1024)
})

void test('an EXIF-rotated photo is bounded by its displayed size', async () => {
  const rotated = await sharp({ create: { width: 200, height: 100, channels: 3, background: '#fff' } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer()
  const output = await transformTo(rotated, 2400)
  assert.equal(output.width, 100)
})
