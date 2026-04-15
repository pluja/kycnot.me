import { orderBy } from 'lodash-es'

import { getCurrencyInfo } from '../constants/currencies'
import { getVerificationStatusInfo } from '../constants/verificationStatus'
import { areEqualArraysWithoutOrder } from './arrays'
import { pluralize } from './pluralize'
import { transformCase } from './strings'

type SearchFilters = {
  q: string
  categories: string[]
  verification: string[]
  currencies: string[]
  'currency-mode': 'or' | 'and'
  'attribute-mode': 'or' | 'and'
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
  if (filters.q) {
    return `Search results for “${filters.q}”`
  }

  if (hasDefaultFilters && forPageTitle) {
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
    kycLevel = `with KYC level ${filters['max-kyc']} or better`
    prefix = ''
  }

  if (filters['min-score'] >= 1) {
    score = `with score ${filters['min-score'].toLocaleString()} or more`
    prefix = ''
  }

  const buildTitle = (segments: string[]) => transformCase(`${prefix} ${base} ${segments.join('; ')}`.trim(), 'first-upper')

  const titleCandidates = [
    buildTitle([attributesPart, currencies, kycLevel, score].filter((value) => !!value)),
    buildTitle([attributesPart, currencies, kycLevel].filter((value) => !!value)),
    buildTitle([currencies, kycLevel].filter((value) => !!value)),
    buildTitle([currencies].filter((value) => !!value)),
    buildTitle([]),
  ]

  return titleCandidates.find((candidate) => candidate.length <= MAX_TITLE_LENGTH) ?? titleCandidates.at(-1) ?? 'Services'
}

export function makeSearchMetaDescription({
  title,
  total,
  filters,
  hasDefaultFilters,
}: {
  title: string
  total: number
  filters: SearchFilters
  hasDefaultFilters: boolean
}) {
  if (filters.q) {
    return `Search KYCnot.me for “${filters.q}” and compare privacy-focused services by score, trust, supported currencies, and KYC requirements.`
  }

  if (hasDefaultFilters) {
    return "Find crypto exchanges, wallets, and services that don't require KYC verification. Browse privacy-focused alternatives with trust scores and detailed reviews."
  }

  const titleText = title.charAt(0).toLowerCase() + title.slice(1)
  const resultText = `${total.toLocaleString()} ${pluralize('result', total)}`

  return `Browse ${resultText} for ${titleText} on KYCnot.me. Compare privacy scores, trust signals, supported currencies, and KYC requirements.`
}
