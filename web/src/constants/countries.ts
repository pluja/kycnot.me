import { countries as countriesData, type TCountryCode } from 'countries-list'
import { countries as flagCountries } from 'country-flag-icons'
import getUnicodeFlagIcon from 'country-flag-icons/unicode'

import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'

type CountryInfo<T extends string | null | undefined = string> = {
  code: T
  name: string
  flag: string
  slug: string
  order: number
}

// Convert countries-list data to our format, ensuring we only use countries that have flags
const countriesArray = Object.entries(countriesData)
  .filter(([code]) => flagCountries.includes(code as TCountryCode))
  .map(([code, data]) => ({
    code: code as TCountryCode,
    name: data.name,
    flag: getUnicodeFlagIcon(code) || '🏳️',
    slug: code.toLowerCase(),
    order: data.name.charCodeAt(0), // Sort alphabetically by first letter
  }))
  // Pre-sort the array alphabetically by name for performance
  .sort((a, b) => a.name.localeCompare(b.name))

// Create a map for efficient lookups
const countriesMap = new Map(countriesArray.map((country) => [country.code, country]))

export const {
  dataArray: countries,
  dataObject: countriesById,
  getFn: getCountryInfo,
  getFnSlug: getCountryInfoBySlug,
  zodEnumBySlug: countriesZodEnumBySlug,
  zodEnumById: countriesZodEnumById,
  keyToSlug: countryCodeToSlug,
  slugToKey: countrySlugToCode,
} = makeHelpersForOptions(
  'code',
  (code): CountryInfo<typeof code> => {
    // For null, undefined, or empty string, return a default "No Country" object
    if (!code) {
      return {
        code,
        name: 'No Country',
        flag: '🏳️',
        slug: '',
        order: 999,
      } as CountryInfo<typeof code>
    }

    // Try to find the country in our pre-built map
    const country = countriesMap.get(code as TCountryCode)

    // If found, return it; otherwise, return a default "Unknown Country" object
    if (country) {
      return country as CountryInfo
    } else {
      return {
        code,
        name: 'Unknown Country',
        flag: '🏳️',
        slug: code.toLowerCase(),
        order: 999,
      } as CountryInfo
    }
  },
  countriesArray
)

// Helper function to validate country code
export const isValidCountryCode = (code: string): code is TCountryCode => {
  return code in countriesData && flagCountries.includes(code as TCountryCode)
}
