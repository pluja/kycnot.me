export type CurrencyDisplayMeta = {
  name: string
  icon: string
  popular: boolean
  /** True when bare CODE = native mainnet (BTC, ETH, ...). Leave unset for multi-chain tokens like USDT. */
  nativeIsDefault?: boolean
  /** Specific (code, network) variants promoted into the popular bucket alongside the bare option. */
  popularNetworks?: string[]
}

// Missing entries still render, using the code itself as the name and the
// fallback icon.
export const currencyDisplayMetadata: Record<string, CurrencyDisplayMeta> = {
  BTC: { name: 'Bitcoin', icon: 'cryptocurrency:btc', popular: true, nativeIsDefault: true },
  XMR: { name: 'Monero', icon: 'cryptocurrency:xmr', popular: true, nativeIsDefault: true },
  ETH: { name: 'Ethereum', icon: 'cryptocurrency:eth', popular: true, nativeIsDefault: true },
  LTC: { name: 'Litecoin', icon: 'cryptocurrency:ltc', popular: true, nativeIsDefault: true },
  USDT: {
    name: 'Tether',
    icon: 'cryptocurrency:usdt',
    popular: true,
    popularNetworks: ['ERC20', 'TRC20', 'BEP20'],
  },
  USDC: {
    name: 'USD Coin',
    icon: 'cryptocurrency:usdc',
    popular: true,
    popularNetworks: ['ERC20', 'BEP20'],
  },
  BNB: { name: 'BNB', icon: 'cryptocurrency:bnb', popular: true, nativeIsDefault: true },
  SOL: { name: 'Solana', icon: 'cryptocurrency:sol', popular: true, nativeIsDefault: true },
  DOGE: { name: 'Dogecoin', icon: 'cryptocurrency:doge', popular: true, nativeIsDefault: true },
  ZEC: { name: 'Zcash', icon: 'cryptocurrency:zec', popular: true, nativeIsDefault: true },
  TRX: { name: 'TRON', icon: 'cryptocurrency:trx', popular: true, nativeIsDefault: true },
  XNO: { name: 'Nano', icon: 'cryptocurrency:nano', popular: true, nativeIsDefault: true },
  NANO: { name: 'Nano', icon: 'cryptocurrency:nano', popular: true, nativeIsDefault: true },
  BCH: { name: 'Bitcoin Cash', icon: 'cryptocurrency:bch', popular: true, nativeIsDefault: true },
  FIRO: { name: 'Firo', icon: 'cryptocurrency:xzc', popular: true, nativeIsDefault: true },
}

export const FALLBACK_ICON = 'ri:coin-line'
