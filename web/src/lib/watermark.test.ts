import assert from 'node:assert/strict'
import { test } from 'node:test'

import sharp from 'sharp'

import { watermarkImage } from './watermark'

void test('watermarkImage preserves dimensions and format while changing pixels', async () => {
  const original = await sharp({
    create: { width: 400, height: 300, channels: 3, background: { r: 210, g: 210, b: 210 } },
  })
    .png()
    .toBuffer()

  const watermarked = await watermarkImage(original)
  const metadata = await sharp(watermarked).metadata()

  assert.equal(metadata.width, 400)
  assert.equal(metadata.height, 300)
  assert.equal(metadata.format, 'png')
  assert.notDeepEqual(watermarked, original)
})

void test('watermarkImage keeps the original format for jpeg input', async () => {
  const original = await sharp({
    create: { width: 256, height: 256, channels: 3, background: { r: 20, g: 20, b: 20 } },
  })
    .jpeg()
    .toBuffer()

  const metadata = await sharp(await watermarkImage(original)).metadata()
  assert.equal(metadata.format, 'jpeg')
})

void test('watermarkImage returns non-image input untouched', async () => {
  const garbage = Buffer.from('this is not an image')
  assert.deepEqual(await watermarkImage(garbage), garbage)
})
