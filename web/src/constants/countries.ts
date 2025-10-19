import { countries as countriesData, type TCountryCode } from 'countries-list'
import { countries as flagCountries } from 'country-flag-icons'
import getUnicodeFlagIcon from 'country-flag-icons/unicode'
import { orderBy } from 'lodash-es'

import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'

type CountryInfo<T extends string | null | undefined = string> = {
  code: T
  name: string
  flag: string
}

export const {
  dataArray: countries,
  dataObject: countriesByCode,
  getFn: getCountryInfo,
  zodEnumById: countriesZodEnumByCode,
} = makeHelpersForOptions(
  'code',
  (code): CountryInfo<typeof code> => ({
    code,
    name: code?.toLocaleUpperCase() ?? 'Unknown',
    flag: getUnicodeFlagIcon(code ?? '') || '🏳️',
  }),
  orderBy(
    Object.entries(countriesData)
      .filter(([code]) => flagCountries.includes(code as TCountryCode))
      .map(
        ([code, data]) =>
          ({
            code: code as TCountryCode,
            name: data.name,
            flag: getUnicodeFlagIcon(code) || '🏳️',
          }) satisfies CountryInfo<TCountryCode>
      ),
    ['name'],
    ['asc']
  )
)
