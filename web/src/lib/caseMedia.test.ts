import assert from 'node:assert/strict'
import { test } from 'node:test'

import { caseEvidenceMediaUrl } from './caseMedia'

void test('maps a case-evidence upload to its access-checked route', () => {
  assert.equal(caseEvidenceMediaUrl('/files/cases/12/ab34cd56ef.png'), '/case-media/12/ab34cd56ef.png')
})

void test('leaves non-case uploads untouched', () => {
  assert.equal(caseEvidenceMediaUrl('/files/services/pictures/x.png'), '/files/services/pictures/x.png')
  assert.equal(caseEvidenceMediaUrl('/files/evidence/trocador/x.png'), '/files/evidence/trocador/x.png')
  assert.equal(caseEvidenceMediaUrl(''), '')
})

void test('does not rewrite a lookalike that is not under /files/cases/', () => {
  assert.equal(caseEvidenceMediaUrl('/files/casesX/1/x.png'), '/files/casesX/1/x.png')
})
