import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createOgImageTextNormalizer,
  isAllowedOgImageSource,
  isValidOgImageIcon,
  stripOgImageEmoji,
} from './ogImageInput'

void test('strips whole emoji graphemes and keeps surrounding text', () => {
  assert.equal(stripOgImageEmoji('plain text'), 'plain text')
  assert.equal(stripOgImageEmoji('Bisq 👨‍👩‍👧‍👦 exchange'), 'Bisq  exchange')
  assert.equal(stripOgImageEmoji('🇬🇷'), '')
  assert.equal(stripOgImageEmoji('⚠️ alert'), ' alert')
  assert.equal(stripOgImageEmoji('a😀z'.repeat(20)), 'az'.repeat(20))
})

void test('normalizes text without splitting graphemes or keeping emoji', () => {
  const normalizeText = createOgImageTextNormalizer(20)
  const normalized = normalizeText(`a${'👨‍👩‍👧‍👦'.repeat(20)}z`, 20)

  assert.equal(normalized, 'az')
  assert.equal(normalized.includes('\u200d'), false)
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
