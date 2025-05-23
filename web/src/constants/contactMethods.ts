import { parsePhoneNumberWithError } from 'libphonenumber-js'

import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

type ContactMethodInfo<T extends string | null | undefined = string> = {
  type: T
  label: string
  /** Notice that the first capture group is then used to format the value */
  matcher: RegExp
  formatter: (value: string) => string | null
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
    formatter: (value) => value,
  }),
  [
    {
      type: 'email',
      label: 'Email',
      matcher: /mailto:(.*)/,
      formatter: (value) => value,
      icon: 'ri:mail-line',
    },
    {
      type: 'telephone',
      label: 'Telephone',
      matcher: /tel:(.*)/,
      formatter: (value) => {
        return parsePhoneNumberWithError(value).formatInternational()
      },
      icon: 'ri:phone-line',
    },
    {
      type: 'whatsapp',
      label: 'WhatsApp',
      matcher: /https?:\/\/(?:www\.)?wa\.me\/(.*)\/?/,
      formatter: (value) => {
        return parsePhoneNumberWithError(value).formatInternational()
      },
      icon: 'ri:whatsapp-line',
    },
    {
      type: 'telegram',
      label: 'Telegram',
      matcher: /https?:\/\/(?:www\.)?t\.me\/(.*)\/?/,
      formatter: (value) => `t.me/${value}`,
      icon: 'ri:telegram-line',
    },
    {
      type: 'linkedin',
      label: 'LinkedIn',
      matcher: /https?:\/\/(?:www\.)?linkedin\.com\/(?:in|company)\/(.*)\/?/,
      formatter: (value) => `in/${value}`,
      icon: 'ri:linkedin-box-line',
    },
    {
      type: 'website',
      label: 'Website',
      matcher: /https?:\/\/(?:www\.)?((?:[a-zA-Z0-9-]+\.)+[a-zA-Z]+)/,
      formatter: (value) => value,
      icon: 'ri:global-line',
    },
    {
      type: 'x',
      label: 'X',
      matcher: /https?:\/\/(?:www\.)?x\.com\/(.*)\/?/,
      formatter: (value) => `@${value}`,
      icon: 'ri:twitter-x-line',
    },
    {
      type: 'instagram',
      label: 'Instagram',
      matcher: /https?:\/\/(?:www\.)?instagram\.com\/(.*)\/?/,
      formatter: (value) => `@${value}`,
      icon: 'ri:instagram-line',
    },
    {
      type: 'matrix',
      label: 'Matrix',
      matcher: /https?:\/\/(?:www\.)?matrix\.to\/#\/(.*)\/?/,
      formatter: (value) => value,
      icon: 'ri:hashtag',
    },
    {
      type: 'bitcointalk',
      label: 'BitcoinTalk',
      matcher: /https?:\/\/(?:www\.)?bitcointalk\.org/,
      formatter: () => 'BitcoinTalk',
      icon: 'ri:btc-line',
    },
  ] as const satisfies ContactMethodInfo[]
)

export function formatContactMethod(url: string) {
  for (const contactMethod of contactMethods) {
    const captureGroup = url.match(contactMethod.matcher)?.[1]
    if (!captureGroup) continue

    const formattedValue = contactMethod.formatter(captureGroup)
    if (!formattedValue) continue

    return {
      ...contactMethod,
      formattedValue,
    } as const
  }

  return { ...getContactMethodInfo('unknown'), formattedValue: url } as const
}
