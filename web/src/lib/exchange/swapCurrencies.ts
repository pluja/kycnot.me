import { currencyDisplayMetadata, FALLBACK_ICON } from './currencyMapping'
import { getCachedCurrencies } from './listCurrencies'

import type { Currency } from '../../generated/aggregator/v1/aggregator'

export type SwapOption = {
  value: string
  code: string
  network: string
  name: string
  icon: string
  popular: boolean
}

export type SwapCurrencies = {
  options: SwapOption[]
  popular: SwapOption[]
  other: SwapOption[]
  byValue: Map<string, SwapOption>
  degraded: boolean
  reason?: string
}

export async function getSwapCurrencies(): Promise<SwapCurrencies> {
  try {
    const currencies = await getCachedCurrencies()
    const options = expandCurrencies(currencies)
    return bucketize(options)
  } catch (err) {
    const options = fallbackOptions()
    return {
      ...bucketize(options),
      degraded: true,
      reason: err instanceof Error ? err.message : 'Unknown aggregator error',
    }
  }
}

function expandCurrencies(currencies: Currency[]): SwapOption[] {
  const options: SwapOption[] = []
  for (const currency of currencies) {
    const meta = currencyDisplayMetadata[currency.code]
    const hasVariants = currency.networks.length > 0
    // Suppress the bare CODE option for multi-network tokens like USDT so
    // the user is forced to pick a network. Native-default assets (BTC, ETH,
    // LTC) and assets with no variants at all still expose bare.
    const includeBare = !hasVariants || meta?.nativeIsDefault === true

    if (includeBare) {
      options.push({
        value: currency.code.toLowerCase(),
        code: currency.code,
        network: '',
        name: meta?.name ?? currency.code,
        icon: meta?.icon ?? FALLBACK_ICON,
        popular: meta?.popular ?? false,
      })
    }
    for (const network of currency.networks) {
      options.push({
        value: `${currency.code.toLowerCase()}@${network.toLowerCase()}`,
        code: currency.code,
        network,
        name: meta?.name ?? currency.code,
        icon: meta?.icon ?? FALLBACK_ICON,
        popular: (meta?.popular ?? false) && (meta?.popularNetworks?.includes(network) ?? false),
      })
    }
  }
  return options
}

// Render a minimal form even when the aggregator is unreachable: curated
// popular assets as bare options, no network variants.
function fallbackOptions(): SwapOption[] {
  return Object.entries(currencyDisplayMetadata)
    .filter(([, meta]) => meta.popular)
    .map(([code, meta]) => ({
      value: code.toLowerCase(),
      code,
      network: '',
      name: meta.name,
      icon: meta.icon,
      popular: true,
    }))
}

function bucketize(options: SwapOption[]): SwapCurrencies {
  const sorted = [...options].sort(compareOptions)
  const popular = sorted.filter((o) => o.popular)
  const other = sorted.filter((o) => !o.popular)
  const byValue = new Map(sorted.map((o) => [o.value, o]))
  return { options: sorted, popular, other, byValue, degraded: false }
}

// BTC, XMR, ETH pinned to the top of the popular bucket; everything else
// falls back to alphabetical so the dropdown stays predictable.
const PRIORITY_CODES = ['BTC', 'XMR', 'ETH']

function priorityRank(code: string): number {
  const idx = PRIORITY_CODES.indexOf(code)
  return idx === -1 ? PRIORITY_CODES.length : idx
}

function compareOptions(a: SwapOption, b: SwapOption): number {
  if (a.code !== b.code) {
    const ra = priorityRank(a.code)
    const rb = priorityRank(b.code)
    if (ra !== rb) return ra - rb
    return a.code.localeCompare(b.code)
  }
  if (a.network === '') return -1
  if (b.network === '') return 1
  return a.network.localeCompare(b.network)
}
