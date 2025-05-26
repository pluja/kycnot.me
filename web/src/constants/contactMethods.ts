import { parsePhoneNumberWithError } from 'libphonenumber-js'

import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

type ContactMethodInfo<T extends string | null | undefined = string> = {
  type: T
  label: string
  /** Notice that the first capture group is then used to format the value */
  matcher: RegExp
  formatter: (match: RegExpMatchArray) => string | null
  icon: string
}

export const {
  dataArray: contactMethods,
  dataObject: contactMethodsById,
  /** Use {@link formatContactMethod} instead */
  getFn: getContactMethodInfo,
} = makeHelpersForOptions(
  'type',
  (type): ContactMethodInfo<typeof type> => ({
    type,
    label: type ? transformCase(type, 'title') : String(type),
    icon: 'ri:shield-fill',
    matcher: /(.*)/,
    formatter: ([, value]) => value ?? String(value),
  }),
  [
    {
      type: 'email',
      label: 'Email',
      matcher: /mailto:(.+)/,
      formatter: ([, value]) => value ?? 'Email',
      icon: 'ri:mail-line',
    },
    {
      type: 'telephone',
      label: 'Telephone',
      matcher: /tel:(.+)/,
      formatter: ([, value]) => {
        return value ? parsePhoneNumberWithError(value).formatInternational() : 'Telephone'
      },
      icon: 'ri:phone-line',
    },
    {
      type: 'whatsapp',
      label: 'WhatsApp',
      matcher: /^https?:\/\/(?:www\.)?wa\.me\/(.+)/,
      formatter: ([, value]) => {
        return value ? parsePhoneNumberWithError(value).formatInternational() : 'WhatsApp'
      },
      icon: 'ri:whatsapp-line',
    },
    {
      type: 'telegram',
      label: 'Telegram',
      matcher: /^https?:\/\/(?:www\.)?t\.me\/(.+)/,
      formatter: ([, value]) => (value ? `t.me/${value}` : 'Telegram'),
      icon: 'ri:telegram-line',
    },
    {
      type: 'linkedin',
      label: 'LinkedIn',
      matcher: /^https?:\/\/(?:www\.)?linkedin\.com\/(?:in|company)\/(.+)/,
      formatter: ([, value]) => (value ? `in/${value}` : 'LinkedIn'),
      icon: 'ri:linkedin-box-line',
    },
    {
      type: 'x',
      label: 'X',
      matcher: /^https?:\/\/(?:www\.)?x\.com\/(.+)/,
      formatter: ([, value]) => (value ? `@${value}` : 'X'),
      icon: 'ri:twitter-x-line',
    },
    {
      type: 'instagram',
      label: 'Instagram',
      matcher: /^https?:\/\/(?:www\.)?instagram\.com\/(.+)/,
      formatter: ([, value]) => (value ? `@${value}` : 'Instagram'),
      icon: 'ri:instagram-line',
    },
    {
      type: 'matrix',
      label: 'Matrix',
      matcher: /^https?:\/\/(?:www\.)?matrix\.to\/#\/(.+)/,
      formatter: ([, value]) => (value ? `#${value}` : 'Matrix'),
      icon: 'ri:hashtag',
    },
    {
      type: 'bitcointalk',
      label: 'BitcoinTalk',
      matcher: /^https?:\/\/(?:www\.)?bitcointalk\.org/,
      formatter: () => 'BitcoinTalk',
      icon: 'ri:btc-line',
    },
    {
      type: 'simplex',
      label: 'SimpleX Chat',
      matcher: /^https?:\/\/(?:www\.)?(simplex\.chat)\//,
      formatter: () => 'SimpleX Chat',
      icon: 'simplex',
    },
    {
      type: 'nostr',
      label: 'Nostr',
      matcher: /\b(npub1[a-zA-Z0-9]{58})\b/,
      formatter: () => 'Nostr',
      icon: 'nostr',
    },
    {
      // Website must go last because it's a catch-all
      type: 'website',
      label: 'Website',
      matcher: /^https?:\/\/(?:www\.)?((?:[a-zA-Z0-9-]+\.)+[a-zA-Z]+)/,
      formatter: ([, value]) => value ?? 'Website',
      icon: 'ri:global-line',
    },
  ] as const satisfies ContactMethodInfo[]
)

export function formatContactMethod(url: string) {
  for (const contactMethod of contactMethods) {
    const match = url.match(contactMethod.matcher)
    if (!match) continue

    const formattedValue = contactMethod.formatter(match)
    if (!formattedValue) continue

    return {
      ...contactMethod,
      formattedValue,
    } as const
  }

  return { ...getContactMethodInfo('unknown'), formattedValue: url } as const
}
