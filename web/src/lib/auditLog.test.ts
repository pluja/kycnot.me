import assert from 'node:assert/strict'
import { test } from 'node:test'

import { recordAuditLog } from './auditLog'

type Written = { data: unknown }

function fakeClient() {
  const created: Written[] = []
  return {
    created,
    auditLog: {
      create: (args: Written) => {
        created.push(args)
        return Promise.resolve()
      },
    },
  }
}

const entry = {
  actorId: 7,
  action: 'STATUS_CHANGED' as const,
  targetType: 'SERVICE_SUGGESTION' as const,
  targetId: 42,
  summary: 'Status set to approved, from pending',
}

test('recordAuditLog writes exactly what it was given', async () => {
  const client = fakeClient()

  await recordAuditLog(client, entry)

  assert.equal(client.created.length, 1)
  assert.deepEqual(client.created[0]?.data, {
    actorId: 7,
    action: 'STATUS_CHANGED',
    targetType: 'SERVICE_SUGGESTION',
    targetId: 42,
    summary: 'Status set to approved, from pending',
  })
})

test('recordAuditLog keeps an unattributed act rather than dropping it', async () => {
  // Anything the platform does on its own still belongs in the trail.
  const client = fakeClient()

  await recordAuditLog(client, { ...entry, actorId: undefined })

  assert.equal((client.created[0]?.data as { actorId: unknown }).actorId, null)
})
