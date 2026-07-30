import assert from 'node:assert/strict'
import { test } from 'node:test'

import { firstParagraph, proseBlocks, stripMarkdown } from './strings'

void test('stripMarkdown flattens a body to one line of prose', () => {
  assert.equal(stripMarkdown('## See [docs](https://x.dev)\n\n**now**'), 'See docs now')
  assert.equal(stripMarkdown('![shot](/a.png)Text'), 'Text')
  assert.equal(stripMarkdown(''), '')
})

void test('firstParagraph returns only the opening paragraph', () => {
  assert.equal(
    firstParagraph('Withdrawals are paused.\n\nThe operator says more soon.'),
    'Withdrawals are paused.'
  )
})

void test('firstParagraph keeps a multi-line paragraph whole', () => {
  assert.equal(firstParagraph('Funds are\nstill frozen.\n\nLater.'), 'Funds are still frozen.')
})

void test('firstParagraph skips a leading heading rather than summarising as it', () => {
  assert.equal(firstParagraph('## Outage\n\nWithdrawals paused.'), 'Withdrawals paused.')
  assert.equal(firstParagraph('# A\n\n## B\n\nReal text.'), 'Real text.')
})

void test('firstParagraph skips blocks that flatten to nothing', () => {
  // Leading blank lines and an image-only block carry no prose of their own.
  assert.equal(firstParagraph('\n\n![shot](/a.png)\n\nThe actual lead.'), 'The actual lead.')
})

void test('firstParagraph falls back to the whole body when there is no paragraph', () => {
  // A body that is nothing but a heading still has to render something.
  assert.equal(firstParagraph('## Only a heading'), 'Only a heading')
  assert.equal(firstParagraph(''), '')
})

void test('firstParagraph handles a body with no blank lines at all', () => {
  assert.equal(firstParagraph('One single line of content.'), 'One single line of content.')
})

void test('proseBlocks answers whether anything follows the lead', () => {
  // A trailing heading is not something to read, so it must not offer a disclosure.
  assert.deepEqual(proseBlocks('Only a lead.\n\n## Heading'), ['Only a lead.'])
  assert.deepEqual(proseBlocks('Lead.\n\n## Heading\n\nMore.'), ['Lead.', 'More.'])
  assert.deepEqual(proseBlocks('One paragraph with no breaks at all.'), [
    'One paragraph with no breaks at all.',
  ])
  assert.deepEqual(proseBlocks('## Only a heading'), [])
})
