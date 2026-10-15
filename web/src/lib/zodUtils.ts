import { z, type ZodTypeAny } from 'astro/zod'
import { round } from 'lodash-es'

import { safeHttpUrl } from './exchange/safeUrl'

// emptyToUndefined treats null and '' as "not provided": Astro coerces empty or absent form fields to null
// before zod runs.
export const emptyToUndefined = (value: unknown) => (value === '' || value == null ? undefined : value)

const addZodPipe = (schema: ZodTypeAny, zodPipe?: ZodTypeAny) => {
  return zodPipe ? schema.pipe(zodPipe) : schema
}

/**
 * The difference between this and `z.coerce.number()` is that an empty string won't be coerced to 0.
 *
 * If you don't accept 0, just use `z.coerce.number().int().positive()` instead.
 */
export const zodCohercedNumber = (zodPipe?: ZodTypeAny) =>
  addZodPipe(z.number().or(z.string().nonempty()), zodPipe)

const cleanUrl = (input: unknown) => {
  if (typeof input !== 'string') return input
  const cleanInput = input.trim().replace(/\/$/, '')
  return !/^\w+:\/\//i.test(cleanInput) ? `https://${cleanInput}` : cleanInput
}

// Contact methods and URLs are rendered straight into an href, so the scheme
// must be constrained. cleanUrl only forces https:// onto schemeless input; an
// explicit scheme (javascript:, data:, ...) is kept verbatim, so the scheme
// guard below is what rejects script-capable URLs.
const CONTACT_METHOD_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:'])
const hasRenderableContactScheme = (value: string): boolean => {
  try {
    return CONTACT_METHOD_SCHEMES.has(new URL(value).protocol)
  } catch {
    return false
  }
}

export const noControlCharacters = /^\P{Cc}*$/u

export const DISPLAY_NAME_MAX_LENGTH = 50
export const displayNameSchema = z
  .string()
  .max(DISPLAY_NAME_MAX_LENGTH, `Display name must be ${String(DISPLAY_NAME_MAX_LENGTH)} characters or less`)
  .regex(noControlCharacters, 'Display name cannot contain control characters')

export const httpUrlSchema = z
  .string()
  .url('Must be a valid URL')
  .max(255, 'URL must be 255 characters or less')
  .refine((value) => safeHttpUrl(value) !== null, 'URL must start with http:// or https://')

export const zodUrlOptionalProtocol = z.preprocess(
  cleanUrl,
  z
    .string()
    .refine((value) => /^(https?:\/\/)?[^\s$.?#]+(\.[^\s$.?#])*(\.[a-z0-9]{2,}).*$/i.test(value), {
      message: 'Invalid URL',
    })
    .refine((value) => safeHttpUrl(value) !== null, {
      message: 'URL must start with http:// or https://',
    })
)

const PHONE_REGEX = /^([\d\s+\-_/()[\]*#.,]|ext|x){7,}$/i
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

// zodContactMethod is idempotent: a stored value (already carrying mailto: or
// tel:) parses back to itself, so a prefilled form round-trips unchanged.
export const zodContactMethod = z.preprocess(
  (input) => {
    if (typeof input !== 'string') return input
    const cleanInput = input.trim()

    if (/^(mailto|tel):/i.test(cleanInput)) return cleanInput
    if (PHONE_REGEX.test(cleanInput)) return `tel:${cleanInput}`
    if (EMAIL_REGEX.test(cleanInput)) return `mailto:${cleanInput}`

    return cleanUrl(cleanInput)
  },
  z
    .string()
    .trim()
    .refine(
      (value) => {
        if (/^tel:/i.test(value)) return PHONE_REGEX.test(value.slice('tel:'.length))
        if (/^mailto:/i.test(value)) return EMAIL_REGEX.test(value.slice('mailto:'.length))
        return /^(https?:\/\/)?[^\s$.?#]+(\.[^\s$.?#])*(\.[a-z0-9]{2,}).*$/i.test(value)
      },
      {
        message: 'Invalid contact method',
      }
    )
    .refine(hasRenderableContactScheme, {
      message: 'Contact method must be a URL, email, or phone number',
    })
)

const stringToArrayFactory = (delimiter: RegExp | string = ',') => {
  return <T>(input: T) =>
    typeof input !== 'string'
      ? (input ?? undefined)
      : input
          .split(delimiter)
          .map((item) => item.trim())
          .filter((item) => item !== '')
}

export const stringListOfSlugsSchemaRequired = z.preprocess(
  stringToArrayFactory(/[\s,\n]+/),
  z.array(z.string().regex(/^[a-z0-9-_A-Z]+$/)).min(1)
)

// MAX_URLS_PER_LIST is well above any listing so far; the worker visits each site, so the list must stay bounded.
const MAX_URLS_PER_LIST = 30

export const stringListOfUrlsSchema = z.preprocess(
  stringToArrayFactory(/[\s,\n]+/),
  z.array(zodUrlOptionalProtocol).max(MAX_URLS_PER_LIST).default([])
)

export const stringListOfUrlsSchemaRequired = z.preprocess(
  stringToArrayFactory(/[\s,\n]+/),
  z.array(zodUrlOptionalProtocol).min(1).max(MAX_URLS_PER_LIST)
)

// stringListOfContactMethodsSchema splits on line breaks only: a phone number contains spaces.
export const stringListOfContactMethodsSchema = z.preprocess(
  stringToArrayFactory(/[\r\n]+/),
  z.array(zodContactMethod).default([])
)

const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5MB

export const ACCEPTED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/avif',
  'image/webp',
] as const satisfies string[]

export const imageFileSchema = z
  .instanceof(File)
  .optional()
  .nullable()
  .transform((file) => (!file || file.size === 0 || !file.name ? undefined : file))
  .refine(
    (file) => !file || file.size <= MAX_IMAGE_SIZE,
    `Max image size is ${round(MAX_IMAGE_SIZE / 1024 / 1024, 3).toLocaleString()}MB.`
  )
  .refine(
    (file) => !file || ACCEPTED_IMAGE_TYPES.some((type) => file.type === type),
    'Only PNG, JPG, AVIF, WebP formats are supported.'
  )

export const imageFileSchemaRequired = imageFileSchema.refine((file) => !!file, 'Required')

// formCheckbox reads an HTML checkbox: present ("on") is true, absent is false.
export const formCheckbox = z.preprocess(
  (value) => value === true || value === 'true' || value === 'on',
  z.boolean()
)
