// Pure /swap SEO helpers. Split from swapPageInfo.ts so node:test can import
// them without pulling in astro:env/client.

import { currencyDisplayMetadata, FALLBACK_ICON } from './currencyMapping'
import { buildSwapUrl } from './swapUrls'

export type SwapPair = { from: string; to: string }
export type FaqItem = { id?: string; q: string; a: string }
export const SWAP_FAQ_GUARANTEE_ID = 'swap-faq-guarantee'

// Indexable pair surface. Sitemap + canonical URLs derive from this exact
// set so SEO behaviour is stable regardless of aggregator health.
export const POPULAR_SWAP_PAIRS: readonly SwapPair[] = [
  { from: 'btc', to: 'xmr' },
  { from: 'xmr', to: 'btc' },
  { from: 'btc', to: 'eth' },
  { from: 'eth', to: 'btc' },
  { from: 'btc', to: 'ltc' },
  { from: 'ltc', to: 'btc' },
  { from: 'xmr', to: 'ltc' },
  { from: 'ltc', to: 'xmr' },
  { from: 'xmr', to: 'eth' },
  { from: 'eth', to: 'xmr' },
  { from: 'eth', to: 'ltc' },
  { from: 'btc', to: 'usdt@trc20' },
  { from: 'usdt@trc20', to: 'btc' },
  { from: 'btc', to: 'usdt@erc20' },
  { from: 'btc', to: 'usdc@erc20' },
  { from: 'eth', to: 'usdt@erc20' },
  { from: 'usdt@trc20', to: 'xmr' },
  { from: 'xmr', to: 'usdt@trc20' },
  { from: 'usdc@erc20', to: 'xmr' },
]

// Above-the-fold chip shortlist; must be a subset of POPULAR_SWAP_PAIRS.
export const SWAP_CHIPS_PAIRS: readonly SwapPair[] = [
  { from: 'btc', to: 'xmr' },
  { from: 'xmr', to: 'btc' },
  { from: 'btc', to: 'eth' },
  { from: 'eth', to: 'btc' },
  { from: 'btc', to: 'ltc' },
  { from: 'ltc', to: 'xmr' },
]

const POPULAR_SWAP_PAIRS_SET = new Set(POPULAR_SWAP_PAIRS.map((p) => `${p.from}|${p.to}`))

export type LabelParts = { code: string; network: string; name: string; icon: string }

// Only slugs with a network suffix live here; bare assets fall through to
// currencyDisplayMetadata via lookupLabel to avoid duplicating that data.
export const NETWORK_LABELS: Record<string, LabelParts> = {
  'usdt@trc20': { code: 'USDT', network: 'TRC20', name: 'Tether', icon: 'cryptocurrency:usdt' },
  'usdt@erc20': { code: 'USDT', network: 'ERC20', name: 'Tether', icon: 'cryptocurrency:usdt' },
  'usdt@bep20': { code: 'USDT', network: 'BEP20', name: 'Tether', icon: 'cryptocurrency:usdt' },
  'usdc@erc20': { code: 'USDC', network: 'ERC20', name: 'USD Coin', icon: 'cryptocurrency:usdc' },
  'usdc@bep20': { code: 'USDC', network: 'BEP20', name: 'USD Coin', icon: 'cryptocurrency:usdc' },
}

export function lookupLabel(slug: string): LabelParts {
  const networked = NETWORK_LABELS[slug]
  if (networked) return networked
  const upper = slug.toUpperCase()
  const meta = currencyDisplayMetadata[upper]
  if (meta) {
    return { code: upper, network: '', name: meta.name, icon: meta.icon }
  }
  const [code = slug, network = ''] = slug.split('@')
  return {
    code: code.toUpperCase(),
    network: network.toUpperCase(),
    name: code.toUpperCase(),
    icon: FALLBACK_ICON,
  }
}

/** Code-forward label for chips + OG headline, e.g. `USDT (TRC20)`. */
export function formatCurrencyLabel(slug: string): string {
  const { code, network } = lookupLabel(slug)
  return network ? `${code} (${network})` : code
}

/** Prose-style name for titles + descriptions, e.g. `Tether (TRC20)`. */
export function formatCurrencyHumanName(slug: string): string {
  const { name, network } = lookupLabel(slug)
  return network ? `${name} (${network})` : name
}

// Null for anything off the curated indexable surface so the page canonicalises
// back to /swap instead of a long tail of junk URLs.
export function resolveSwapPair(searchParams: URLSearchParams): SwapPair | null {
  const rawFrom = searchParams.get('from')?.toLowerCase()
  const rawTo = searchParams.get('to')?.toLowerCase()
  if (!rawFrom || !rawTo) return null
  if (rawFrom === rawTo) return null
  if (!POPULAR_SWAP_PAIRS_SET.has(`${rawFrom}|${rawTo}`)) return null
  return { from: rawFrom, to: rawTo }
}

export function buildCanonical(pair: SwapPair | null): string {
  if (!pair) return '/swap'
  return buildSwapUrl(pair.from, pair.to)
}

export function buildTitle(pair: SwapPair | null): string {
  if (!pair) return 'Compare Crypto Exchange Rates: No KYC'
  const fromName = formatCurrencyHumanName(pair.from)
  const toName = formatCurrencyHumanName(pair.to)
  return `Swap ${fromName} to ${toName}: KYC-Free Rate Comparison`
}

export function buildDescription(pair: SwapPair | null): string {
  if (!pair) {
    return 'Compare live rates from privacy-respecting, KYC-free crypto exchanges. Find the best rate for Monero, Bitcoin, Ethereum, USDT, and more.'
  }
  const fromName = formatCurrencyHumanName(pair.from)
  const toName = formatCurrencyHumanName(pair.to)
  return `Compare ${fromName} to ${toName} rates across KYC-free exchanges. KYCnot.me aggregates live quotes and sorts by best market rate, then hands the swap off to the provider you pick.`
}

export function buildOgImageProps(pair: SwapPair | null) {
  if (!pair) {
    return {
      template: 'generic' as const,
      title: 'Compare Swap Rates',
      description: 'KYC-free exchange rate comparison across every major provider.',
    }
  }
  return {
    template: 'generic' as const,
    title: `${formatCurrencyLabel(pair.from)} → ${formatCurrencyLabel(pair.to)}`,
    description: `Compare ${formatCurrencyHumanName(pair.from)} → ${formatCurrencyHumanName(pair.to)} rates from KYC-free exchanges.`,
    icon: lookupLabel(pair.from).icon,
  }
}

// Shared by the visible accordion and the FAQPage JSON-LD.
export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    q: 'What does KYC-free mean?',
    a: 'KYC (Know Your Customer) is the process where an exchange asks for identity verification before letting you trade. A KYC-free swap lets you exchange crypto without submitting personal documents. That does not mean a provider will accept every coin history without question. Some no-KYC services still refund coins or apply extra checks or fees under their own risk rules.',
  },
  {
    q: 'Is this tool non-custodial?',
    a: 'KYCnot.me itself never holds your funds. We compare rates across providers and link you directly to them. The underlying swap is executed by the provider you choose, so custodial behaviour depends on each one.',
  },
  {
    q: 'Do you charge fees for using the comparison?',
    a: "No. Using KYCnot.me is free. Some providers pay us a referral fee out of their margin, which doesn't change the rate you receive and helps us maintain this site.",
  },
  {
    q: 'Which is the best exchange for a given pair?',
    a: 'The best exchange depends on your priorities: the cheapest rate, the lowest KYC risk, or the highest trust score. The comparison table is sorted by best rate by default, with the KYC level and provider score visible in each row so you can choose based on what matters to you. You can click any provider row to open more details about its KYC practices and related information.',
  },
  {
    id: SWAP_FAQ_GUARANTEE_ID,
    q: 'What is the guarantee shown on some providers?',
    a: 'Some providers are covered by a guarantee made possible through our partnership with [OrangeFren](/service/orangefren). On the results page, those providers are marked with a shield icon next to their name. This is **not** blanket insurance for every bad outcome. It is only meant for cases where a covered exchange violates its own stated policies to the detriment of our user.',
  },
  {
    q: 'When am I eligible for the guarantee?',
    a: 'The guarantee only applies in strict cases. You must contact us within **4 weeks** of the swap being created and provide enough details for us to review what happened. If the outcome is consistent with the provider’s own stated rules, terms, policy details, KYC level, or warnings shown on KYCnot.me, the guarantee does not apply. This includes cases where a provider reserves the right to request KYC or SoF and actually asks you to complete that verification.',
  },
  {
    q: 'Who should I contact if there is a problem with my swap?',
    a: 'Please contact the support team of the provider you used first. KYCnot.me is a small project run by two people and we do not offer formal support for the swap services listed here. If there is a serious issue or the provider support team is unresponsive, you can contact us through [kycnot.me/about#contact](https://kycnot.me/about#contact) with the provider name and relevant details. We may try to help because we want users to be treated fairly, but we cannot promise direct support or resolution.',
  },
  {
    q: 'Does this website require JavaScript enabled?',
    a: 'No. All core features on KYCnot.me work with JavaScript disabled. Enabling JavaScript only adds convenience features and reduces full-page refreshes. All of our JavaScript code is open source, and we publish source maps so it is easier to inspect.',
  },
]

export function faqAnswerToPlainText(markdown: string): string {
  return markdown.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)').replace(/[*_`~]/g, '')
}

// Module-load guard against slug typos: without this, a misspelt pair would
// silently ship as a generic sitemap URL and generic copy.
function assertCuratedSlugsHaveLabels(): void {
  const slugs = new Set<string>()
  for (const { from, to } of POPULAR_SWAP_PAIRS) {
    slugs.add(from)
    slugs.add(to)
  }
  for (const { from, to } of SWAP_CHIPS_PAIRS) {
    slugs.add(from)
    slugs.add(to)
  }
  const missing: string[] = []
  for (const slug of slugs) {
    if (slug in NETWORK_LABELS) continue
    if (currencyDisplayMetadata[slug.toUpperCase()]) continue
    missing.push(slug)
  }
  if (missing.length > 0) {
    throw new Error(
      `swapPageInfo: curated swap pair slugs have no label in NETWORK_LABELS or currencyDisplayMetadata: ${missing.join(', ')}`
    )
  }
}

assertCuratedSlugsHaveLabels()
