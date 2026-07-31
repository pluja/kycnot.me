import { getEventDisplay, pickPrimaryEvent } from '../../lib/eventKind'

import type { DisplayableEvent, EventDisplay } from '../../lib/eventKind'

export type SwapAmountSide = 'receive' | 'send'
export type SwapSortBy = 'kyc' | 'rate' | 'score'

type QuoteGuaranteeInfo = {
  orangefrenGuarantee: number | null
  amountFrom: number
  amountReceived: number
  currencyFrom: string
  currencyTo: string
}

type SortableSwapResult = {
  serviceSlug: string
  service: {
    overallScore: number
    kycLevel: number | string
  } | null
} & (
  | {
      quote: {
        amountFrom: number
        amountReceived: number
      }
      error: null
    }
  | {
      quote: null
      error: unknown
    }
)

export function formatSwapAmount(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 8 })
}

export function formatSwapRate(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 6 })
}

export function formatDisplayAmount(value: number, approximate = false): string {
  return `${approximate ? '~' : ''}${formatSwapAmount(value)}`
}

export function formatSwapPercent(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
}

export function describeBestComparison(
  percent: number | null | undefined,
  amountSide: SwapAmountSide,
  isBest: boolean
): string {
  if (isBest || percent == null) {
    return amountSide === 'send' ? 'Most received' : 'Cheapest quote'
  }

  return amountSide === 'send'
    ? `${percent.toFixed(2)}% less than best`
    : `${percent.toFixed(2)}% more than cheapest`
}

export function describeMarketComparison(percent: number): string {
  if (percent < 0) return `${Math.abs(percent).toFixed(2)}% better than market`
  if (percent > 0) return `${percent.toFixed(2)}% worse than market`
  return 'At market rate'
}

export function describeSortOrder(
  amountSide: SwapAmountSide,
  currencyFromCode: string,
  currencyToCode: string
): string {
  return amountSide === 'send'
    ? `Sorted by most ${currencyToCode} received for the same ${currencyFromCode} amount.`
    : `Sorted by the lowest ${currencyFromCode} required for the same ${currencyToCode} amount.`
}

export function describeGuaranteeCoverage(
  quote: QuoteGuaranteeInfo | null | undefined
): { summaryLabel: string; tooltipLabel: string } | null {
  if (quote?.orangefrenGuarantee == null || quote.orangefrenGuarantee <= 0) return null

  const fromBase = quote.currencyFrom.split('@')[0]?.toLowerCase() ?? ''
  const toBase = quote.currencyTo.split('@')[0]?.toLowerCase() ?? ''

  let coveredPercent: number | null = null
  if (fromBase === 'btc' && quote.amountFrom > 0) {
    coveredPercent = (quote.orangefrenGuarantee / quote.amountFrom) * 100
  } else if (toBase === 'btc' && quote.amountReceived > 0) {
    coveredPercent = (quote.orangefrenGuarantee / quote.amountReceived) * 100
  }

  if (coveredPercent == null || !Number.isFinite(coveredPercent)) {
    return {
      summaryLabel: 'Guarantee Available',
      tooltipLabel: 'Guarantee Available',
    }
  }

  const roundedPercent = Math.min(100, Math.max(0, Math.round(coveredPercent)))
  return {
    summaryLabel: `Guarantee: ${String(roundedPercent)}% covered`,
    tooltipLabel: `Guarantee Available: ${String(roundedPercent)}% covered`,
  }
}

export function sortSwapResults<T extends SortableSwapResult>(
  results: T[],
  sortBy: SwapSortBy,
  amountSide: SwapAmountSide
): T[] {
  const withIndex = results.map((item, index) => ({ item, index }))
  withIndex.sort((left, right) => {
    const byQuotePresence = Number(right.item.quote !== null) - Number(left.item.quote !== null)
    if (byQuotePresence !== 0) return byQuotePresence
    if (left.item.quote === null || right.item.quote === null) {
      return left.index - right.index
    }

    if (sortBy === 'score') {
      const scoreDelta =
        (right.item.service?.overallScore ?? Number.NEGATIVE_INFINITY) -
        (left.item.service?.overallScore ?? Number.NEGATIVE_INFINITY)
      if (scoreDelta !== 0) return scoreDelta
    } else if (sortBy === 'kyc') {
      const kycDelta =
        Number(left.item.service?.kycLevel ?? Number.POSITIVE_INFINITY) -
        Number(right.item.service?.kycLevel ?? Number.POSITIVE_INFINITY)
      if (kycDelta !== 0) return kycDelta
    } else if (amountSide === 'send') {
      const receivedDelta = right.item.quote.amountReceived - left.item.quote.amountReceived
      if (receivedDelta !== 0) return receivedDelta
    } else {
      const amountFromDelta = left.item.quote.amountFrom - right.item.quote.amountFrom
      if (amountFromDelta !== 0) return amountFromDelta
    }

    if (amountSide === 'send') {
      const receivedDelta = right.item.quote.amountReceived - left.item.quote.amountReceived
      if (receivedDelta !== 0) return receivedDelta
    } else {
      const amountFromDelta = left.item.quote.amountFrom - right.item.quote.amountFrom
      if (amountFromDelta !== 0) return amountFromDelta
    }

    return left.index - right.index
  })
  return withIndex.map(({ item }) => item)
}

export function findBestRateServiceSlug<T extends SortableSwapResult>(
  results: T[],
  amountSide: SwapAmountSide
): string | null {
  const withQuote = results.filter(
    (item): item is T & { quote: NonNullable<T['quote']> } => item.quote !== null
  )
  let best: (typeof withQuote)[number] | null = null
  for (const item of withQuote) {
    if (best === null) {
      best = item
      continue
    }
    if (
      amountSide === 'send'
        ? item.quote.amountReceived > best.quote.amountReceived
        : item.quote.amountFrom < best.quote.amountFrom
    ) {
      best = item
    }
  }
  return best?.serviceSlug ?? null
}

/// makeActiveEventBadge reduces a service's active warnings to the single badge a
/// swap row shows. The aggregator has already filtered the list to active
/// warnings and alerts, so only severity ranking is left to do.
export function makeActiveEventBadge<T extends DisplayableEvent & { title: string }>(
  events: readonly T[]
): { title: string; display: EventDisplay; totalCount: number } | null {
  const primaryEvent = pickPrimaryEvent(events)
  if (!primaryEvent) return null
  return {
    title: primaryEvent.title,
    display: getEventDisplay(primaryEvent),
    totalCount: events.length,
  }
}
