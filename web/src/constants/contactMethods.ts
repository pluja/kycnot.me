import { parsePhoneNumberWithError } from 'libphonenumber-js'

import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { Assert } from '../lib/assert'
import type { Equals } from 'ts-toolbelt/out/Any/Equals'

type ContactMethodInfo<T extends string | null | undefined = string> = {
  type: T
  label: string
  /** Notice that the first capture group is then used to format the value */
  matcher: RegExp
  formatter: (match: RegExpMatchArray) => string | null
  icon: string
  urlType: string
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
    icon: 'ri:link',
    matcher: /(.*)/,
    formatter: ([, value]) => value ?? String(value),
    urlType: type ?? 'unknown',
  }),
  [
    {
      type: 'email',
      label: 'Email',
      matcher: /mailto:(.+)/,
      formatter: ([, value]) => value ?? 'Email',
      icon: 'ri:mail-line',
      urlType: 'email',
    },
    {
      type: 'telephone',
      label: 'Telephone',
      matcher: /tel:(.+)/,
      formatter: ([, value]) => {
        try {
          return value ? parsePhoneNumberWithError(value).formatInternational() : 'Telephone'
        } catch (_error) {
          console.error(`Invalid telephone number: ${value ?? 'undefined'}`, _error)
          return value ?? 'Telephone'
        }
      },
      icon: 'ri:phone-line',
      urlType: 'telephone',
    },
    {
      type: 'whatsapp',
      label: 'WhatsApp',
      matcher: /^https?:\/\/(?:www\.)?wa\.me\/(.+)/,
      formatter: ([, value]) => {
        try {
          return value ? parsePhoneNumberWithError(value).formatInternational() : 'WhatsApp'
        } catch (_error) {
          console.error(`Invalid WhatsApp number: ${value ?? 'undefined'}`, _error)
          return value ?? 'WhatsApp'
        }
      },
      icon: 'ri:whatsapp-line',
      urlType: 'url',
    },
    {
      type: 'telegram',
      label: 'Telegram',
      matcher: /^https?:\/\/(?:www\.)?t\.me\/(.+)/,
      formatter: ([, value]) => (value ? `t.me/${value}` : 'Telegram'),
      icon: 'ri:telegram-line',
      urlType: 'url',
    },
    {
      type: 'linkedin',
      label: 'LinkedIn',
      matcher: /^https?:\/\/(?:www\.)?linkedin\.com\/(?:in|company)\/(.+)/,
      formatter: ([, value]) => (value ? `in/${value}` : 'LinkedIn'),
      icon: 'ri:linkedin-box-line',
      urlType: 'url',
    },
    {
      type: 'x',
      label: 'X',
      matcher: /^https?:\/\/(?:www\.)?x\.com\/(.+)/,
      formatter: ([, value]) => (value ? `@${value}` : 'X'),
      icon: 'ri:twitter-x-line',
      urlType: 'url',
    },
    {
      type: 'instagram',
      label: 'Instagram',
      matcher: /^https?:\/\/(?:www\.)?instagram\.com\/(.+)/,
      formatter: ([, value]) => (value ? `@${value}` : 'Instagram'),
      icon: 'ri:instagram-line',
      urlType: 'url',
    },
    {
      type: 'matrix',
      label: 'Matrix',
      matcher: /^https?:\/\/(?:www\.)?matrix\.to\/#\/(.+)/,
      formatter: ([, value]) => (value ? `#${value}` : 'Matrix'),
      icon: 'ri:hashtag',
      urlType: 'url',
    },
    {
      type: 'bitcointalk',
      label: 'BitcoinTalk',
      matcher: /^https?:\/\/(?:www\.)?bitcointalk\.org/,
      formatter: () => 'BitcoinTalk',
      icon: 'ri:btc-line',
      urlType: 'url',
    },
    {
      type: 'simplex',
      label: 'SimpleX Chat',
      matcher: /^https?:\/\/(?:www\.)?(simplex\.chat)\//,
      formatter: () => 'SimpleX Chat',
      icon: 'simplex',
      urlType: 'url',
    },
    {
      type: 'nostr',
      label: 'Nostr',
      matcher: /\b(npub1[a-zA-Z0-9]{58})\b/,
      formatter: () => 'Nostr',
      icon: 'nostr',
      urlType: 'url',
    },
    {
      // Website must go last because it's a catch-all
      type: 'website',
      label: 'Website',
      matcher: /^https?:\/\/(?:www\.)?((?:[a-zA-Z0-9-]+\.)+[a-zA-Z]+)/,
      formatter: ([, value]) => value ?? 'Website',
      icon: 'ri:global-line',
      urlType: 'url',
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

type ContactMethodUrlTypeInfo<T extends string | null | undefined = string> = {
  value: T
  labelPlural: string
}

export const {
  dataArray: contactMethodUrlTypes,
  dataObject: contactMethodUrlTypesById,
  getFn: getContactMethodUrlTypeInfo,
} = makeHelpersForOptions(
  'value',
  (value): ContactMethodUrlTypeInfo<typeof value> => ({
    value,
    labelPlural: value ? transformCase(value, 'title') : String(value),
  }),
  [
    {
      value: 'email',
      labelPlural: 'emails',
    },
    {
      value: 'telephone',
      labelPlural: 'phone numbers',
    },
    {
      value: 'url',
      labelPlural: 'URLs',
    },
  ] as const satisfies ContactMethodUrlTypeInfo<(typeof contactMethods)[number]['urlType']>[]
)

type _ExpectUrlTypesToHaveAllValues = Assert<
  Equals<(typeof contactMethods)[number]['urlType'], keyof typeof contactMethodUrlTypesById>
>
