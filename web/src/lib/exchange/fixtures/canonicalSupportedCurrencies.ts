// Drift-guard fixture: minimum backend fallback currency set, canonicalised.
// The live swap selector is broader and comes from OrangeFren's pairs endpoint.
export const CANONICAL_SUPPORTED_CURRENCIES: readonly string[] = [
  'btc',
  'xmr',
  'ltc',
  'eth',
  'sol',
  'bnb',
  'usdt@trc20',
  'usdt@erc20',
  'usdt@bep20',
  'usdc@erc20',
  'usdc@bep20',
  'usdc@sol',
  'btc@ln',
]
