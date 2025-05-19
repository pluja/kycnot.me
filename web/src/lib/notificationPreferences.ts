import { prisma } from './prisma'

import type { Prisma } from '@prisma/client'

export async function getOrCreateNotificationPreferences<T extends Prisma.NotificationPreferencesSelect>(
  userId: number,
  select: { [K in keyof T]: K extends keyof Prisma.NotificationPreferencesSelect ? T[K] : never },
  tx: Prisma.TransactionClient = prisma
) {
  return (
    (await tx.notificationPreferences.findUnique({ where: { userId }, select })) ??
    (await tx.notificationPreferences.create({ data: { userId }, select }))
  )
}
