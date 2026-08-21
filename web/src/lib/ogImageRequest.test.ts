import assert from 'node:assert/strict'
import { test } from 'node:test'

import { OG_IMAGE_LIMITS } from './ogImageInput'
import { parsePublicOgImageRequest } from './ogImageRequest'

void test('uses the default card when data or its template is absent', () => {
  assert.deepEqual(parsePublicOgImageRequest(null), {
    success: true,
    templateName: 'default',
    props: {},
  })
  assert.deepEqual(parsePublicOgImageRequest('{}'), {
    success: true,
    templateName: 'default',
    props: {},
  })
})

void test('accepts a known public template', () => {
  assert.deepEqual(parsePublicOgImageRequest(JSON.stringify({ template: 'generic', title: 'Events' })), {
    success: true,
    templateName: 'generic',
    props: { title: 'Events' },
  })
})

void test('rejects badge templates from the public endpoint', () => {
  const result = parsePublicOgImageRequest(
    JSON.stringify({
      template: 'badge-lg',
      name: 'Forged service',
      verificationStatus: 'APPROVED',
    })
  )

  assert.deepEqual(result, {
    success: false,
    response: 'reject',
    reason: 'Badge templates are not available from the public endpoint',
  })
})

void test('falls back for a present but unknown template', () => {
  assert.deepEqual(parsePublicOgImageRequest(JSON.stringify({ template: 'generci' })), {
    success: false,
    response: 'default',
    reason: 'Unknown template',
  })
})

void test('falls back for malformed JSON and non-object data', () => {
  assert.deepEqual(parsePublicOgImageRequest('{'), {
    success: false,
    response: 'default',
    reason: 'Malformed JSON',
  })
  assert.deepEqual(parsePublicOgImageRequest('null'), {
    success: false,
    response: 'default',
    reason: 'Image data must be a JSON object',
  })
  assert.deepEqual(parsePublicOgImageRequest('[]'), {
    success: false,
    response: 'default',
    reason: 'Image data must be a JSON object',
  })
})

void test('falls back with schema diagnostics for invalid props and unknown fields', () => {
  assert.deepEqual(parsePublicOgImageRequest(JSON.stringify({ template: 'generic', title: 42 })), {
    success: false,
    response: 'default',
    reason: 'Invalid props for "generic": title: invalid_type',
    reasonKey: 'Invalid props for "generic"',
  })
  assert.deepEqual(
    parsePublicOgImageRequest(JSON.stringify({ template: 'generic', title: 'Events', extra: true })),
    {
      success: false,
      response: 'default',
      reason: 'Invalid props for "generic": (root): unrecognized_keys',
      reasonKey: 'Invalid props for "generic"',
    }
  )
  assert.deepEqual(parsePublicOgImageRequest(JSON.stringify({ extra: true })), {
    success: false,
    response: 'default',
    reason: 'Invalid props for "default": (root): unrecognized_keys',
    reasonKey: 'Invalid props for "default"',
  })
})

void test('falls back before parsing oversized image data', () => {
  assert.deepEqual(parsePublicOgImageRequest('x'.repeat(OG_IMAGE_LIMITS.rawData + 1)), {
    success: false,
    response: 'default',
    reason: 'Image data exceeds the length limit',
  })
})

void test('keeps the rejection key bounded while the reason keeps its detail', () => {
  const reject = (categories: unknown) =>
    parsePublicOgImageRequest(JSON.stringify({ template: 'service', categories }))

  const first = reject([{ name: '', icon: 1 }])
  const second = reject([
    { name: 'ok', icon: 'ri:x-line' },
    { name: '', icon: 2 },
  ])

  assert.equal(first.success, false)
  assert.equal(second.success, false)
  assert.notEqual(first.reason, second.reason)
  assert.equal(first.reasonKey, 'Invalid props for "service"')
  assert.equal(second.reasonKey, first.reasonKey)
})
