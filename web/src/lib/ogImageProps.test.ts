import assert from 'node:assert/strict'
import { test } from 'node:test'

import { badgeOgImagePropsSchemas, publicOgImagePropsSchemas, summarizeIssues } from './ogImageProps'

import type { z } from 'zod'

function accepted<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    assert.fail(`expected the props to parse, got ${summarizeIssues(parsed.error)}`)
  }
  return parsed.data as z.output<S>
}

function rejected(schema: z.ZodType, input: unknown): string {
  const parsed = schema.safeParse(input)
  if (parsed.success) {
    assert.fail('expected the props to be rejected')
  }
  return summarizeIssues(parsed.error)
}

const serviceProps = {
  title: 'Trocador',
  description: 'A swap aggregator',
  categories: [{ name: 'Exchanges', icon: 'ri:exchange-line' }],
  score: 8,
  imageUrl: '/files/services/pictures/x.png',
  verificationStatus: 'APPROVED',
}

void test('accepts what the service page sends', () => {
  const props = accepted(publicOgImagePropsSchemas.service, serviceProps)

  assert.equal(props.score, 8)
  assert.equal(props.categories[0]?.icon, 'ri:exchange-line')
})

void test('accepts a service with no picture and no status', () => {
  accepted(publicOgImagePropsSchemas.service, {
    ...serviceProps,
    imageUrl: null,
    verificationStatus: null,
  })
})

void test('rejects a score that is not a number', () => {
  // Unparsed, this painted "NaN" into the score badge and cached it for a year.
  assert.equal(
    rejected(publicOgImagePropsSchemas.service, { ...serviceProps, score: 'eight' }),
    'score: invalid_type'
  )
})

void test('rejects a category that is not an object', () => {
  // Unparsed, `category.icon` threw a TypeError deep inside the render.
  assert.equal(
    rejected(publicOgImagePropsSchemas.service, { ...serviceProps, categories: [null] }),
    'categories.0: invalid_type'
  )
})

void test('rejects categories that are not an array', () => {
  assert.equal(
    rejected(publicOgImagePropsSchemas.service, { ...serviceProps, categories: 'Exchanges' }),
    'categories: invalid_type'
  )
})

void test('rejects an unknown verification status', () => {
  // Unparsed, badgeStatusMap[status] was undefined and `status.color` threw.
  assert.equal(
    rejected(badgeOgImagePropsSchemas['badge-xs'], {
      theme: 'dark',
      verificationStatus: 'SCAMMY',
    }),
    'verificationStatus: invalid_enum_value'
  )
})

void test('rejects a rating that cannot be formatted', () => {
  // Unparsed, `averageUserRating.toFixed(1)` threw a TypeError.
  assert.equal(
    rejected(badgeOgImagePropsSchemas['badge-sm'], {
      theme: 'dark',
      verificationStatus: 'APPROVED',
      overallScore: 8,
      averageUserRating: '5',
      kycLevel: 1,
      showScore: true,
      showRating: true,
      showKycLevel: true,
    }),
    'averageUserRating: invalid_type'
  )
})

void test('caps categories instead of rejecting a service that has many', () => {
  const props = accepted(publicOgImagePropsSchemas.service, {
    ...serviceProps,
    categories: Array.from({ length: 30 }, (_, index) => ({
      name: `Category ${String(index)}`,
      icon: 'ri:exchange-line',
    })),
  })

  assert.equal(props.categories.length, 8)
})

void test('rejects unknown keys instead of hiding input mistakes', () => {
  assert.equal(
    rejected(publicOgImagePropsSchemas.generic, { title: 'Events', constructor: 'boom' }),
    '(root): unrecognized_keys'
  )
})

void test('accepts the optional fields a page omits', () => {
  // JSON.stringify drops undefined, so an absent field must parse like a null.
  accepted(publicOgImagePropsSchemas.generic, { title: 'Events' })
  accepted(publicOgImagePropsSchemas.blog, { title: 'A post' })
  accepted(publicOgImagePropsSchemas.blog, {
    title: 'A post',
    coverImage: '/_astro/cover.hash.webp',
    author: 'pluja',
    publishedAt: '2026-08-14T00:00:00.000Z',
  })
})

void test('accepts empty props for the default card', () => {
  accepted(publicOgImagePropsSchemas.default, {})
})

void test('keeps badge schemas out of the public registry', () => {
  assert.equal(Object.hasOwn(publicOgImagePropsSchemas, 'badge-lg'), false)
  assert.equal(Object.hasOwn(publicOgImagePropsSchemas, 'badge-sm'), false)
  assert.equal(Object.hasOwn(publicOgImagePropsSchemas, 'badge-xs'), false)
})
