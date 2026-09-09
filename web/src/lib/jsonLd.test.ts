import assert from 'node:assert/strict'
import { test } from 'node:test'

import { serializeJsonLd } from './jsonLd'

void test('keeps text intact for a JSON parser and safe inside a script tag', () => {
  const out = serializeJsonLd({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Bisq\'s "review" & </script> <b>',
    url: 'https://example.com/?a=1&b=2',
  })
  assert.ok(!out.includes('</script>'))
  assert.ok(!out.includes('&apos;'))
  assert.ok(!out.includes('&amp;'))
  const parsed = JSON.parse(out) as { name: string; url: string }
  assert.equal(parsed.name, 'Bisq\'s "review" & </script> <b>')
  assert.equal(parsed.url, 'https://example.com/?a=1&b=2')
})
