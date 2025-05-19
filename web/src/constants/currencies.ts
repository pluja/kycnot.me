import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { Currency } from '@prisma/client'

type CurrencyInfo<T extends string | null | undefined = string> = {
  id: T
  icon: string
  name: string
  slug: string
}

export const {
  dataArray: currencies,
  dataObject: currenciesById,
  getFn: getCurrencyInfo,
  getFnSlug: getCurrencyInfoBySlug,
  zodEnumBySlug: currenciesZodEnumBySlug,
  keyToSlug: currencyIdToSlug,
  slugToKey: currencySlugToId,
} = makeHelpersForOptions(
  'id',
  (id): CurrencyInfo<typeof id> => ({
    id,
    icon: 'ri:question-line',
    name: id ? transformCase(id, 'title') : String(id),
    slug: id ? id.toLowerCase() : '',
  }),
  [
    {
      id: 'MONERO',
      icon: 'monero',
      name: 'Monero',
      slug: 'xmr',
    },
    {
      id: 'BITCOIN',
      icon: 'bitcoin',
      name: 'Bitcoin',
      slug: 'btc',
    },
    {
      id: 'LIGHTNING',
      icon: 'ri:flashlight-line',
      name: 'Lightning',
      slug: 'btc-ln',
    },
    {
      id: 'FIAT',
      icon: 'credit-card',
      name: 'Fiat',
      slug: 'fiat',
    },
    {
      id: 'CASH',
      icon: 'coins',
      name: 'Cash',
      slug: 'cash',
    },
  ] as const satisfies CurrencyInfo<Currency>[]
)
