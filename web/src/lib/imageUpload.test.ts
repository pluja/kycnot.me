import assert from 'node:assert/strict'
import { test } from 'node:test'

import sharp from 'sharp'

import { reencodeUploadedImage } from './imageUpload'

const pixel = () =>
  sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 10, b: 10 } } })

void test('a raster upload comes back as WebP without its metadata', async () => {
  const jpeg = await pixel()
    .jpeg()
    .withMetadata({ exif: { IFD0: { Copyright: 'secret-gps-owner' } } })
    .toBuffer()
  const output = await reencodeUploadedImage(jpeg, 4096)
  const metadata = await sharp(output).metadata()
  assert.equal(metadata.format, 'webp')
  assert.equal(metadata.exif, undefined)
  assert.equal(output.includes('secret-gps-owner'), false)
})

void test('markup is refused even under an image name', async () => {
  const payloads = [
    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)" width="8" height="8"/>',
    '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>',
    '<!doctype html><script>alert(1)</script>',
  ]
  for (const payload of payloads) {
    await assert.rejects(reencodeUploadedImage(Buffer.from(payload), 4096))
  }
})

void test('a GIF and a truncated file are refused', async () => {
  const gif = await pixel().gif().toBuffer()
  await assert.rejects(reencodeUploadedImage(gif, 4096))
  const png = await pixel().png().toBuffer()
  await assert.rejects(reencodeUploadedImage(png.subarray(0, png.length / 2), 4096))
})

void test('a trailing payload appended to a real image does not survive', async () => {
  const png = await pixel().png().toBuffer()
  const polyglot = Buffer.concat([png, Buffer.from('<script>alert(1)</script>')])
  const output = await reencodeUploadedImage(polyglot, 4096)
  assert.equal(output.includes('<script>'), false)
})

void test('wide images are scaled to the width limit, tall screenshots keep their height', async () => {
  const wide = await sharp({ create: { width: 3000, height: 1000, channels: 3, background: '#fff' } })
    .png()
    .toBuffer()
  assert.equal((await sharp(await reencodeUploadedImage(wide, 2000)).metadata()).width, 2000)
  const tall = await sharp({ create: { width: 1000, height: 9000, channels: 3, background: '#fff' } })
    .png()
    .toBuffer()
  assert.equal((await sharp(await reencodeUploadedImage(tall, 2000)).metadata()).height, 9000)
})
