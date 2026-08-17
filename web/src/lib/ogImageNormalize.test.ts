import assert from 'node:assert/strict'
import { test } from 'node:test'

import { countOgImageEmoji, OG_IMAGE_LIMITS } from './ogImageInput'
import {
  normalizeOgImageKycLevel,
  normalizeOgImageRating,
  normalizeOgImageScore,
  normalizePublicOgImageProps,
} from './ogImageNormalize'
import { badgeOgImagePropsSchemas, publicOgImagePropsSchemas, summarizeIssues } from './ogImageProps'

import type { OgImagePublicTemplateName, OgImagePublicTemplateWithProps } from './ogImageProps'

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

void test('clamps badge numbers before schema validation', () => {
  const props = {
    theme: 'dark',
    verificationStatus: 'APPROVED',
    overallScore: normalizeOgImageScore(10),
    averageUserRating: normalizeOgImageRating(5.0000000000000036),
    kycLevel: normalizeOgImageKycLevel(4),
    showScore: true,
    showRating: true,
    showKycLevel: true,
  }

  assert.equal(props.averageUserRating, 5)
  assert.equal(badgeOgImagePropsSchemas['badge-sm'].safeParse(props).success, true)
  assert.equal(normalizeOgImageRating(Infinity), null)
  assert.equal(normalizeOgImageKycLevel(-1), 0)
})

void test('every public normalizer output satisfies its schema', () => {
  const hostileText = `${'😀'.repeat(OG_IMAGE_LIMITS.maxEmoji + 20)}${'x'.repeat(1000)}`
  const inputs: OgImagePublicTemplateWithProps[] = [
    { template: 'default' },
    {
      template: 'service',
      title: hostileText,
      description: hostileText,
      categories: Array.from({ length: 30 }, () => ({ name: hostileText, icon: 'bad icon' })),
      score: Infinity,
      imageUrl: 'https://example.com/private.png',
      verificationStatus: null,
    },
    {
      template: 'generic',
      title: hostileText,
      description: hostileText,
      icon: 'bad icon',
    },
    {
      template: 'blog',
      title: hostileText,
      author: hostileText,
      coverImage: 'https://example.com/private.png',
      publishedAt: 'garbage',
    },
  ]
  const inputsByTemplate = new Map(inputs.map((input) => [input.template, input] as const))
  const templateNames = Object.keys(publicOgImagePropsSchemas) as OgImagePublicTemplateName[]

  assert.deepEqual([...inputsByTemplate.keys()].sort(), [...templateNames].sort())
  for (const templateName of templateNames) {
    const input = inputsByTemplate.get(templateName)
    assert.ok(input)
    const normalized = normalizePublicOgImageProps(input)
    assert.equal(normalized.template, templateName)
    const { template: _template, ...props } = normalized
    const parsed = publicOgImagePropsSchemas[templateName].safeParse(props)
    assert.equal(parsed.success, true, parsed.success ? undefined : summarizeIssues(parsed.error))
  }
})
