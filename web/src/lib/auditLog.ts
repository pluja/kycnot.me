import type { AuditAction, AuditTargetType, Prisma } from '@prisma/client'

/**
 * Anything that can write one row, so a caller inside a transaction records the
 * act and the change it describes together, or neither.
 */
type AuditLogWriter = {
  auditLog: {
    create: (args: { data: Prisma.AuditLogUncheckedCreateInput }) => Promise<unknown>
  }
}

type AuditEntry = {
  /** Null for anything the platform did on its own. */
  actorId?: number | null
  action: AuditAction
  targetType: AuditTargetType
  targetId: number
  summary: string
}

export async function recordAuditLog(client: AuditLogWriter, entry: AuditEntry) {
  await client.auditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      summary: entry.summary,
    },
  })
}

/**
 * The target is not a relation, so a caller wanting the actor asks for it here
 * rather than joining from the other side. Ordering is the caller's to choose.
 */
export function auditLogSelect() {
  return {
    id: true,
    action: true,
    summary: true,
    createdAt: true,
    actor: { select: { name: true, displayName: true, picture: true } },
  } satisfies Prisma.AuditLogSelect
}
