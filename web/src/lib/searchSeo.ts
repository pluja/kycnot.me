import { orderBy } from 'lodash-es'

import { getCurrencyInfo } from '../constants/currencies'
import { getVerificationStatusInfo } from '../constants/verificationStatus'

import { areEqualArraysWithoutOrder } from './arrays'
import { MAX_PAGE_TITLE_LENGTH } from './pageTitle'
import { transformCase } from './strings'

type SearchFilters = {
  q: string
  categories: string[]
  verification: string[]
  currencies: string[]
  'currency-mode': 'and' | 'or'
  'attribute-mode': 'and' | 'or'
  'max-kyc': number
  'min-score': number
  attr?: Record<number, '' | 'no' | 'yes'> | Record<string, '' | 'no' | 'yes'>
}

type SearchCategory = {
  slug: string
  name: string
  namePluralLong: string | null
}

type SearchAttribute = {
  id: number
  title: string
}

type SearchAttributeOption = {
  value: string
  prefix: string
  prefixWith: string
}

type SearchSeoInput = {
  filters: SearchFilters
  hasDefaultFilters: boolean
  categories: SearchCategory[]
  attributes: SearchAttribute[]
  attributeOptions: SearchAttributeOption[]
}

export function makeSearchTitle({
  filters,
  hasDefaultFilters,
  categories,
  attributes,
  attributeOptions,
  forPageTitle = false,
}: SearchSeoInput & { forPageTitle?: boolean }) {
  // Search query: surface the term immediately so users know they're in the right place
  if (filters.q) {
    if (forPageTitle) return `Search "${filters.q}" - No-KYC Crypto Services`
    return `Search results for "${filters.q}"`
  }

  // No filters: target "no KYC crypto" head terms
  if (hasDefaultFilters) {
    if (forPageTitle) return 'No-KYC Services Directory - Reviews & Privacy Scores'
    return 'No-KYC crypto services directory'
  }

  const listOrformatter = new Intl.ListFormat('en', { style: 'long', type: 'disjunction' })
  const listAndformatter = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' })
  const MAX_TITLE_LENGTH = 60

  let [prefix, base, attributesPart, currencies, kycLevel, score] = ['', 'services', '', '', '', '']

  if (!hasDefaultFilters) {
    prefix = 'filtered'
  }

  const attributesFilters = Object.entries(filters.attr ?? {})
    .filter((entry): entry is [string, 'no' | 'yes'] => entry[1] === 'yes' || entry[1] === 'no')
    .map(([attributeId, attributeValue]) => {
      const attribute = attributes.find((attr) => String(attr.id) === attributeId)
      if (!attribute) return null
      const valueInfo = attributeOptions.find((option) => option.value === attributeValue)
      const prefix = valueInfo?.prefix ?? transformCase(attributeValue, 'title')
      const prefixWith = valueInfo?.prefixWith ?? transformCase(attributeValue, 'title')
      return {
        prefix,
        prefixWith,
        attribute,
      }
    })
    .filter((attr) => !!attr)

  if (attributesFilters.length === 1 || attributesFilters.length === 2) {
    const formatter = filters['attribute-mode'] === 'and' ? listAndformatter : listOrformatter
    attributesPart = formatter.format(
      attributesFilters.map((attr) => `${attr.prefixWith} ${attr.attribute.title}`)
    )
    prefix = ''
  }

  if (
    filters.verification.length === 1 ||
    (!attributesFilters.length &&
      !filters.currencies.length &&
      !(filters['max-kyc'] <= 3) &&
      !(filters['min-score'] >= 1) &&
      areEqualArraysWithoutOrder(filters.verification, ['APPROVED', 'VERIFICATION_SUCCESS']))
  ) {
    base = `${listAndformatter.format(
      orderBy(
        filters.verification.map((verification) => getVerificationStatusInfo(verification)),
        'order',
        'desc'
      ).map((verification) => verification.label)
    )} services`
    prefix = ''
  }

  if (filters.categories.length >= 1) {
    base = listAndformatter.format(
      filters.categories.map((categorySlug) => {
        const category = categories.find((item) => item.slug === categorySlug)
        if (!category) return categorySlug
        return category.namePluralLong ?? category.name
      })
    )
    prefix = ''
  }

  if (filters.currencies.length >= 1) {
    const currenciesList = filters.currencies.map((currency) => getCurrencyInfo(currency).name)
    const formatter = filters['currency-mode'] === 'and' ? listAndformatter : listOrformatter
    currencies = `that accept ${formatter.format(currenciesList)}`
    prefix = ''
  }

  if (filters['max-kyc'] === 0) {
    kycLevel = 'without KYC'
    prefix = ''
  } else if (filters['max-kyc'] <= 3) {
    kycLevel = `with KYC level ${String(filters['max-kyc'])} or better`
    prefix = ''
  }

  if (filters['min-score'] >= 1) {
    score = `with score ${filters['min-score'].toLocaleString()} or more`
    prefix = ''
  }

  const buildTitle = (segments: string[]) =>
    transformCase(`${prefix} ${base} ${segments.join('; ')}`.trim(), 'first-upper')

  const titleCandidates = [
    buildTitle([attributesPart, currencies, kycLevel, score].filter((value) => !!value)),
    buildTitle([attributesPart, currencies, kycLevel].filter((value) => !!value)),
    buildTitle([currencies, kycLevel].filter((value) => !!value)),
    buildTitle([currencies].filter((value) => !!value)),
    buildTitle([]),
  ]

  const bestTitle =
    titleCandidates.find((candidate) => candidate.length <= MAX_TITLE_LENGTH) ??
    titleCandidates.at(-1) ??
    'Services'

  if (!forPageTitle) return bestTitle

  // When hasDefaultFilters=false but no meaningful custom filter is active (e.g. sort parameter
  // differs from default), the title degenerates to "Approved and Verified services". Detect
  // this "effectively homepage" state and use the custom main-page SEO title instead.
  const hasNoCustomFilters =
    !filters.categories.length &&
    !filters.currencies.length &&
    filters['max-kyc'] >= 4 &&
    filters['min-score'] <= 0 &&
    !attributesFilters.length &&
    areEqualArraysWithoutOrder(filters.verification, ['APPROVED', 'VERIFICATION_SUCCESS'])
  if (hasNoCustomFilters) return 'No-KYC Services Directory - Reviews & Privacy Scores'

  // Build from raw filter parts: "No-KYC [category] [currencies] - Reviews & Privacy Scores"
  // Preserve acronyms (VPNs, CEXs, DEXs, AI...) — only lowercase first char for non-acronyms.
  const b0 = base[0] ?? ''
  const b1 = base[1] ?? ''
  const isAcronymBase = base.length >= 2 && b0 === b0.toUpperCase() && b1 === b1.toUpperCase()
  const baseLabel = isAcronymBase ? base : base.charAt(0).toLowerCase() + base.slice(1)

  // "without KYC" is already implied by the "No-KYC" prefix — skip it to avoid redundancy.
  const kycLabelForTitle = kycLevel === 'without KYC' ? '' : kycLevel

  const subjectParts = [baseLabel, currencies, kycLabelForTitle, attributesPart].filter(Boolean)
  const subject = `No-KYC ${subjectParts.join(' ')}`

  // Try suffixes from most to least descriptive. With extra filter context in the
  // subject, "Privacy Scores" may not fit; fall back to shorter forms.
  const hasExtraContext = !!(currencies || kycLabelForTitle || attributesPart)
  const suffixes = hasExtraContext
    ? [' - Reviews & Privacy Scores', ' - Reviews & Scores', ' - Reviews', '']
    : [' - Reviews & Privacy Scores', ' - Reviews & Scores', '']
  for (const suffix of suffixes) {
    if ((subject + suffix).length <= MAX_PAGE_TITLE_LENGTH) return subject + suffix
  }
  return subject.slice(0, MAX_PAGE_TITLE_LENGTH)
}

export function makeSearchMetaDescription({
  filters,
  hasDefaultFilters,
  categories,
  attributes,
  attributeOptions,
}: SearchSeoInput) {
  // Search query: confirm the result set and explain what they can compare
  if (filters.q) {
    return `Search KYCnot.me for "${filters.q}" - compare no-KYC crypto services by privacy score, trust signals, and currencies accepted. Find verified options without identity verification.`
  }

  // Default: match "no KYC crypto" / "buy crypto without ID" intent
  if (hasDefaultFilters) {
    return 'Find no-KYC crypto exchanges, wallets, VPNs, and more - all verified and ranked by privacy score. Use crypto without identity verification or government-issued ID.'
  }

  // Filtered: describe what's on the page without a count (counts go stale in cached snippets)
  const shortTitle = makeSearchTitle({ filters, hasDefaultFilters, categories, attributes, attributeOptions })
  // Lowercase first char for prose, but preserve acronyms (VPNs, CEXs...)
  const s0 = shortTitle[0] ?? '',
    s1 = shortTitle[1] ?? ''
  const isAcronymShort = shortTitle.length >= 2 && s0 === s0.toUpperCase() && s1 === s1.toUpperCase()
  const shortTitleProse = isAcronymShort
    ? shortTitle
    : shortTitle.charAt(0).toLowerCase() + shortTitle.slice(1)

  return `Browse no-KYC ${shortTitleProse} on KYCnot.me - all verified and ranked by privacy score, trust rating, and accepted currencies. Use crypto without identity verification.`
}
