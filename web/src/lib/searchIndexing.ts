const CURATED_CURRENCY_PAIR = ['btc', 'xmr'] as const
const ATTRIBUTE_PARAM = /^attr-\d+$/

// isIndexableSearch mirrors the shapes the search sitemap emits: one category,
// one currency or BTC and XMR together, an optional no-KYC cut, or a single
// attribute on its own. Deeper combinations, free-text searches and empty
// results stay reachable for visitors but are kept out of the index.
export function isIndexableSearch({
  canonicalParams,
  query,
  shownCount,
}: {
  canonicalParams: URLSearchParams
  query: string
  shownCount: number
}) {
  if (query || shownCount === 0) return false

  const keys = new Set(canonicalParams.keys())
  const attributeKeys = [...keys].filter((key) => ATTRIBUTE_PARAM.test(key))
  const allowedKeys = new Set([
    'categories',
    'currencies',
    'currency-mode',
    'max-kyc',
    'page',
    ...attributeKeys,
  ])
  if ([...keys].some((key) => !allowedKeys.has(key))) return false

  if (attributeKeys.length > 0) {
    const [attributeKey] = attributeKeys
    return (
      attributeKeys.length === 1 &&
      keys.size === (keys.has('page') ? 2 : 1) &&
      canonicalParams.getAll(attributeKey ?? '').join() === 'yes'
    )
  }

  if (canonicalParams.getAll('categories').length > 1) return false

  const maxKyc = canonicalParams.getAll('max-kyc')
  if (maxKyc.length > 0 && maxKyc.join() !== '0') return false

  const currencies = canonicalParams.getAll('currencies').sort()
  const currencyMode = canonicalParams.getAll('currency-mode')
  if (currencies.length <= 1) return currencyMode.length === 0
  return currencies.join() === CURATED_CURRENCY_PAIR.join() && currencyMode.join() === 'and'
}
