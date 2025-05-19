import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

type NetworkInfo<T extends string | null | undefined = string> = {
  slug: T
  icon: string
  name: string
}

export const {
  dataArray: networks,
  dataObject: networksBySlug,
  getFn: getNetworkInfo,
} = makeHelpersForOptions(
  'slug',
  (slug): NetworkInfo<typeof slug> => ({
    slug,
    icon: 'ri:global-line',
    name: slug ? transformCase(slug, 'title') : String(slug),
  }),
  [
    {
      slug: 'clearnet',
      icon: 'ri:global-line',
      name: 'Clearnet',
    },
    {
      slug: 'onion',
      icon: 'onion',
      name: 'Onion',
    },
    {
      slug: 'i2p',
      icon: 'i2p',
      name: 'I2P',
    },
  ] as const satisfies NetworkInfo[]
)
