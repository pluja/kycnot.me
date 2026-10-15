import assert from 'node:assert/strict'
import { test } from 'node:test'

import { holdReasonLabels } from './commentsWithReplies'

void test('hold reasons read as short labels, unknown ones pass through', () => {
  assert.deepEqual(holdReasonLabels('private proof present, strict commenting'), [
    'proof check',
    'strict mode',
  ])
  assert.deepEqual(holdReasonLabels('brigade confidence 4/5, a new gate'), [
    'coordinated posting',
    'a new gate',
  ])
})
