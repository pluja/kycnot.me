import { parsePhoneNumberWithError } from 'libphonenumber-js'

type Formatter = {
  id: string
  matcher: RegExp
  formatter: (value: string) => string | null
}
const formatters = [
  {
    id: 'email',
    matcher: /mailto:(.*)/,
    formatter: (value) => value,
  },
  {
    id: 'telephone',
    matcher: /tel:(.*)/,
    formatter: (value) => {
      return parsePhoneNumberWithError(value).formatInternational()
    },
  },
  {
    id: 'whatsapp',
    matcher: /https?:\/\/wa\.me\/(.*)\/?/,
    formatter: (value) => {
      return parsePhoneNumberWithError(value).formatInternational()
    },
  },
  {
    id: 'telegram',
    matcher: /https?:\/\/t\.me\/(.*)\/?/,
    formatter: (value) => `t.me/${value}`,
  },
  {
    id: 'linkedin',
    matcher: /https?:\/\/(?:www\.)?linkedin\.com\/(?:in|company)\/(.*)\/?/,
    formatter: (value) => `in/${value}`,
  },
  {
    id: 'website',
    matcher: /https?:\/\/(?:www\.)?((?:[a-zA-Z0-9-]+\.)+[a-zA-Z]+)/,
    formatter: (value) => value,
  },
] as const satisfies Formatter[]

export function formatContactMethod(url: string) {
  for (const formatter of formatters) {
    const captureGroup = url.match(formatter.matcher)?.[1]
    if (!captureGroup) continue

    const formattedValue = formatter.formatter(captureGroup)
    if (!formattedValue) continue

    return {
      type: formatter.id,
      formattedValue,
    } as const
  }

  return null
}
