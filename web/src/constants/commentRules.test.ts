import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { commentIssueTypes } from './commentIssueTypes'
import { commentRules } from './commentRules'

// The worker and the trust trigger keep their own copies of these lists; these tests keep the copies in step.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const quoted = (list: string) =>
  [...list.matchAll(/'([A-Z_]+)'|"([A-Z_]+)"/g)].map((m) => m[1] ?? m[2]).sort()

const workerModeration = read('../../../pyworker/pyworker/tasks/comment_moderation.py')

void test('penalizing rules match the trust trigger and the worker', () => {
  const penalizing = commentRules
    .filter((rule) => rule.penalizes)
    .map((rule) => rule.value)
    .sort()
  const sql = /COUNT\(\*\) FILTER \(WHERE rule IN \(([^)]*)\)\)::INT AS penalizing/.exec(
    read('../../prisma/triggers/18_user_trust.sql')
  )
  const worker = /_PENALIZING_RULES = frozenset\(\s*\{([^}]*)\}/.exec(workerModeration)
  assert.ok(sql && worker)
  assert.deepEqual(quoted(sql[1] ?? ''), penalizing)
  assert.deepEqual(quoted(worker[1] ?? ''), penalizing)
})

void test('claims that need proof match the worker', () => {
  const needingProof = commentIssueTypes
    .filter((issue) => issue.requiresProof)
    .map((issue) => issue.value)
    .sort()
  const worker = /_HARM_CLAIMS = frozenset\(\{([^}]*)\}\)/.exec(workerModeration)
  assert.ok(worker)
  assert.deepEqual(quoted(worker[1] ?? ''), needingProof)
})
