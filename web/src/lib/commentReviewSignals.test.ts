import assert from 'node:assert/strict'
import { test } from 'node:test'

import { commentReviewSignals } from './commentReviewSignals'

void test('review signals find disguised contact details and slurs without changing text', () => {
  const content =
    'Recovered my funds, email kristina hooper 24 at ---- gmail ---- com. r3tarded <script>alert(1)</script>'
  const signals = commentReviewSignals(content)
  assert.deepEqual(signals.reasons, ['Possible recovery solicitation', 'Possible slur'])
  assert.equal(signals.parts.map((part) => part.text).join(''), content)
  assert.equal(signals.parts.find((part) => part.reason === 'Possible slur')?.text, 'r3tarded')
})

void test('a normal refund report is not a recovery solicitation signal', () => {
  assert.deepEqual(commentReviewSignals('Support refunded my order today.').reasons, [])
  assert.deepEqual(commentReviewSignals('Support is available at help@example.com.').reasons, [
    'Contact details in post',
  ])
})
