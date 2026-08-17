import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  countOgImageEmoji,
  createOgImageTextNormalizer,
  isAllowedOgImageSource,
  isValidOgImageIcon,
  OG_IMAGE_LIMITS,
} from './ogImageInput'

void test('counts emoji graphemes instead of code points', () => {
  assert.equal(countOgImageEmoji(['plain text']), 0)
  assert.equal(countOgImageEmoji(['👨‍👩‍👧‍👦']), 1)
  assert.equal(countOgImageEmoji(['🇬🇷']), 1)
  assert.equal(countOgImageEmoji(['😀'.repeat(20)]), 20)
})

void test('normalizes text without splitting graphemes', () => {
  const normalizeText = createOgImageTextNormalizer(20)
  const normalized = normalizeText(`a${'👨‍👩‍👧‍👦'.repeat(20)}z`, 20)

  assert.equal(normalized.startsWith('a'), true)
  assert.equal(normalized.endsWith('\u200d'), false)
  assert.ok(normalized.length <= 20)
  assert.ok(countOgImageEmoji([normalized]) <= OG_IMAGE_LIMITS.maxEmoji)
})

void test('accepts confined local image sources', () => {
  assert.equal(isAllowedOgImageSource('/files/services/pictures/x.png'), true)
  assert.equal(isAllowedOgImageSource('/_astro/cover.hash.webp'), true)
  assert.equal(isAllowedOgImageSource('/@fs/project/src/cover.png'), true)
})

void test('rejects foreign and traversing image sources', () => {
  assert.equal(isAllowedOgImageSource('https://example.com/files/services/x.png'), false)
  assert.equal(isAllowedOgImageSource('/private/cover.png'), false)
  assert.equal(isAllowedOgImageSource('/_astro/../server/entry.mjs'), false)
  assert.equal(isAllowedOgImageSource('/_astro/%2e%2e/server/entry.mjs'), false)
  assert.equal(isAllowedOgImageSource('/_astro\\..\\server\\entry.mjs'), false)
})

void test('accepts Iconify names and rejects URL-like icon values', () => {
  assert.equal(isValidOgImageIcon('ri:exchange-line'), true)
  assert.equal(isValidOgImageIcon('material-symbols:shield-lock'), true)
  assert.equal(isValidOgImageIcon('https://example.com/icon.svg'), false)
  assert.equal(isValidOgImageIcon('ri:icon?x=1'), false)
})
