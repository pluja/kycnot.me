// Aggregate counters only. No IP, User-Agent, session,
// cookie, user id, or sub-day timestamp is stored or used here. Dimensions
// describe site activity, never who triggered it. See model Stat in prisma/schema.prisma.

import { prisma } from './prisma'

export type StatKind = 'swap.clickout' | 'swap.quote-fetched' | 'swap.view'

type BumpArgs = {
  kind: StatKind
  serviceId?: number
  fromCurrency?: string
  toCurrency?: string
  refCode?: string
}

const buildDimensionKey = (a: BumpArgs): string =>
  JSON.stringify([a.serviceId ?? null, a.fromCurrency ?? null, a.toCurrency ?? null, a.refCode ?? null])

const utcDayStart = (): Date => {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d
}

export async function bump(args: BumpArgs): Promise<void> {
  const day = utcDayStart()
  const dimensionKey = buildDimensionKey(args)
  await prisma.stat.upsert({
    where: { kind_day_dimensionKey: { kind: args.kind, day, dimensionKey } },
    create: {
      kind: args.kind,
      day,
      dimensionKey,
      serviceId: args.serviceId ?? null,
      fromCurrency: args.fromCurrency ?? null,
      toCurrency: args.toCurrency ?? null,
      refCode: args.refCode ?? null,
      count: 1,
    },
    update: { count: { increment: 1 } },
  })
}

// Bounded await for hot paths like /go/: hand off the increment without
// letting a slow DB write block the response.
export async function bumpWithTimeout(args: BumpArgs, timeoutMs = 200): Promise<void> {
  await Promise.race([bump(args), new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))])
}
