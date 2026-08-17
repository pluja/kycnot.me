import assert from 'node:assert/strict'
import { test } from 'node:test'

import { countOgImageEmoji, OG_IMAGE_LIMITS } from './ogImageInput'
import { normalizePublicOgImageProps } from './ogImageNormalize'
import { publicOgImagePropsSchemas } from './ogImageProps'

void test('normalizes generic text and icons', () => {
  const data = normalizePublicOgImageProps({
    template: 'generic',
    title: `Events ${'😀'.repeat(OG_IMAGE_LIMITS.maxEmoji + 10)}`,
    description: 'x'.repeat(OG_IMAGE_LIMITS.generic.description + 100),
    icon: 'not-an-icon',
  })

  assert.equal(data.template, 'generic')
  assert.ok(data.title.length <= OG_IMAGE_LIMITS.generic.title)
  assert.ok(countOgImageEmoji([data.title, data.description ?? '']) <= OG_IMAGE_LIMITS.maxEmoji)
  assert.equal(data.icon, undefined)

  const { template: _template, ...props } = data
  assert.equal(publicOgImagePropsSchemas.generic.safeParse(props).success, true)
})

void test('normalizes service categories, score, and image source', () => {
  const data = normalizePublicOgImageProps({
    template: 'service',
    title: 'Service',
    description: 'Description',
    categories: Array.from({ length: 20 }, (_, index) => ({
      name: `Category ${String(index)}`,
      icon: 'bad icon',
    })),
    score: Infinity,
    imageUrl: 'https://example.com/files/services/x.png',
    verificationStatus: 'APPROVED',
  })

  assert.equal(data.template, 'service')
  assert.equal(data.categories.length, OG_IMAGE_LIMITS.maxCategories)
  assert.equal(data.score, 0)
  assert.equal(data.imageUrl, undefined)
  assert.equal(
    data.categories.every(({ icon }) => icon === 'ri:question-line'),
    true
  )

  const { template: _template, ...props } = data
  assert.equal(publicOgImagePropsSchemas.service.safeParse(props).success, true)
})

void test('drops invalid optional blog fields', () => {
  const data = normalizePublicOgImageProps({
    template: 'blog',
    title: 'A post',
    coverImage: '/private/cover.png',
    publishedAt: 'garbage',
  })

  assert.equal(data.template, 'blog')
  assert.equal(data.coverImage, undefined)
  assert.equal(data.publishedAt, undefined)

  const { template: _template, ...props } = data
  assert.equal(publicOgImagePropsSchemas.blog.safeParse(props).success, true)
})
