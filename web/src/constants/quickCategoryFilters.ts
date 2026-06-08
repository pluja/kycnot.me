export type QuickCategoryFilter = {
  label: string
  icon: string
  slugs: readonly string[]
}

// Popular category presets surfaced above the table view. Each maps to one or
// more real category slugs; slugs that don't exist in the database are dropped
// at render, so this list can stay ahead of the seeded categories.
export const quickCategoryFilters = [
  {
    label: 'Exchanges',
    icon: 'ri:exchange-line',
    slugs: ['exchange', 'aggregator', 'dex', 'indie-exchange', 'p2p'],
  },
  { label: 'VPNs', icon: 'ri:shield-keyhole-line', slugs: ['vpn'] },
  { label: 'VPS & Hosting', icon: 'ri:server-line', slugs: ['vps', 'hosting'] },
  { label: 'SMS & eSIM', icon: 'ri:smartphone-line', slugs: ['sms', 'esim'] },
  { label: 'Domains', icon: 'ri:global-line', slugs: ['domains'] },
  { label: 'Shopping', icon: 'ri:shopping-bag-line', slugs: ['goods', 'marketplace'] },
  { label: 'Gift cards', icon: 'ri:gift-line', slugs: ['gift-cards', 'cards'] },
] as const satisfies readonly QuickCategoryFilter[]
