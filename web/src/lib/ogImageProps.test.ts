import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ogImagePropsSchemas, summarizeIssues } from './ogImageProps'

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
  const props = accepted(ogImagePropsSchemas.service, serviceProps)

  assert.equal(props.score, 8)
  assert.equal(props.categories[0]?.icon, 'ri:exchange-line')
})

void test('accepts a service with no picture and no status', () => {
  accepted(ogImagePropsSchemas.service, { ...serviceProps, imageUrl: null, verificationStatus: null })
})

void test('rejects a score that is not a number', () => {
  // Unparsed, this painted "NaN" into the score badge and cached it for a year.
  assert.equal(
    rejected(ogImagePropsSchemas.service, { ...serviceProps, score: 'eight' }),
    'score: invalid_type'
  )
})

void test('rejects a category that is not an object', () => {
  // Unparsed, `category.icon` threw a TypeError deep inside the render.
  assert.equal(
    rejected(ogImagePropsSchemas.service, { ...serviceProps, categories: [null] }),
    'categories.0: invalid_type'
  )
})

void test('rejects categories that are not an array', () => {
  assert.equal(
    rejected(ogImagePropsSchemas.service, { ...serviceProps, categories: 'Exchanges' }),
    'categories: invalid_type'
  )
})

void test('rejects an unknown verification status', () => {
  // Unparsed, badgeStatusMap[status] was undefined and `status.color` threw.
  assert.equal(
    rejected(ogImagePropsSchemas['badge-xs'], { theme: 'dark', verificationStatus: 'SCAMMY' }),
    'verificationStatus: invalid_enum_value'
  )
})

void test('rejects a rating that cannot be formatted', () => {
  // Unparsed, `averageUserRating.toFixed(1)` threw a TypeError.
  assert.equal(
    rejected(ogImagePropsSchemas['badge-sm'], {
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
  const props = accepted(ogImagePropsSchemas.service, {
    ...serviceProps,
    categories: Array.from({ length: 30 }, (_, index) => ({
      name: `Category ${String(index)}`,
      icon: 'ri:exchange-line',
    })),
  })

  assert.equal(props.categories.length, 8)
})

void test('drops unknown keys rather than passing them to the template', () => {
  const props = accepted(ogImagePropsSchemas.generic, { title: 'Events', constructor: 'boom' })

  assert.equal(Object.hasOwn(props, 'constructor'), false)
})

void test('accepts the optional fields a page omits', () => {
  // JSON.stringify drops undefined, so an absent field must parse like a null.
  accepted(ogImagePropsSchemas.generic, { title: 'Events' })
  accepted(ogImagePropsSchemas.blog, { title: 'A post' })
  accepted(ogImagePropsSchemas.blog, {
    title: 'A post',
    coverImage: '/_astro/cover.hash.webp',
    author: 'pluja',
    publishedAt: '2026-08-14T00:00:00.000Z',
  })
})

void test('accepts empty props for the default card', () => {
  accepted(ogImagePropsSchemas.default, {})
})
