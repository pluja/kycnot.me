import { z } from 'astro/zod'
import { isEqual, omit } from 'lodash-es'

import { areEqualObjectsWithoutOrder } from './objects'
import { getObjectSearchParam, makeObjectSearchParamKeyRegex } from './urls'

import type { APIContext, AstroGlobal } from 'astro'
import type { ZodError, ZodType, ZodTypeDef } from 'astro/zod'

type MyZodUnknown<Output = unknown, Def extends ZodTypeDef = ZodTypeDef, Input = Output> = ZodType<
  Output,
  Def,
  Input
>

type ZodParseFromUrlOptions = {
  allOptional?: boolean
}

/**
 * Parses an array of values from a URL with zod.
 *
 * The wrong values are skipped, and the errors are returned.
 *
 * @example
 * ```ts
 * const schema = z.array(z.enum(['S', 'M', 'L', 'XL']))
 * const urlValue = ['wrong', 'M', 'L']
 * const { data, errors } = zodParseArray(schema, urlValue)
 * // data: ['M', 'L']
 * // errors: [{ key: 0, error: ZodError }]
 * ```
 */
function zodParseArray<T extends MyZodUnknown>(schema: T, urlValue: string[] | readonly string[]) {
  const unwrappedSchema = unwrapSchema(schema, {
    default: true,
    optional: true,
    nullable: true,
  })
  const itemSchema =
    unwrappedSchema instanceof z.ZodArray ? (unwrappedSchema as z.ZodArray<MyZodUnknown>).element : undefined

  if (!itemSchema || urlValue.length === 0) {
    const parsedArray = schema.safeParse(
      schema instanceof z.ZodDefault && urlValue.length === 0 ? undefined : urlValue
    )
    return parsedArray.success
      ? {
          data: parsedArray.data,
          errors: [],
        }
      : {
          data: schema instanceof z.ZodOptional ? undefined : [],
          errors: [{ key: 0, error: parsedArray.error }],
        }
  }

  const parsedItems = urlValue.map((item) => itemSchema.safeParse(item))

  return {
    data: parsedItems.filter((parsed) => parsed.success).map((r) => r.data),
    errors: parsedItems.filter((parsed) => !parsed.success).map((r, i) => ({ key: i, error: r.error })),
  }
}

/**
 * Parses the query params of a URL with zod.
 *
 * The wrong values are set to `undefined`, and the errors are returned.
 *
 * @example
 * ```ts
 * const params = new URLSearchParams('sizes=M&sizes=L&max-price=wrong')
 * const schema = {
 *   sizes: z.array(z.enum(['S', 'M', 'L', 'XL'])),
 *   'max-price': z.coerce.number(),
 *   'min-price': z.coerce.number().default(0),
 * }
 * const { data, errors } = zodParseQueryParams(schema, params)
 * // data:
 * // {
 * //   sizes: ['M', 'L'],
 * //   'max-price': undefined,
 * //   'min-price': 0
 * // }
 * // errors: [{ key: 'max-price', error: ZodError }]
 * ```
 */
export function zodParseQueryParams<T extends Record<string, MyZodUnknown>, O extends ZodParseFromUrlOptions>(
  shape: T,
  params: URLSearchParams,
  options?: O
) {
  const errors: { key: string; error: ZodError }[] = []

  const data = Object.fromEntries(
    Object.entries(shape).map(([key, paramSchema]) => {
      const schema =
        !(paramSchema instanceof z.ZodDefault || paramSchema instanceof z.ZodEffects) &&
        options?.allOptional !== false
          ? paramSchema.optional()
          : paramSchema
      const unwrappedSchema = unwrapSchema(schema, {
        default: true,
        optional: true,
        nullable: true,
      })

      if (unwrappedSchema instanceof z.ZodArray) {
        const parsed = zodParseArray(schema, params.getAll(key))
        const firstError = parsed.errors[0]
        if (firstError) errors.push({ key, error: firstError.error })

        return [key, parsed.data]
      }
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      const urlStringValue = params.get(key) || undefined
      const urlValue =
        unwrappedSchema instanceof z.ZodArray
          ? params.getAll(key)
          : unwrappedSchema instanceof z.ZodObject || unwrappedSchema instanceof z.ZodRecord
            ? getObjectSearchParam(params, key)
            : urlStringValue

      const parsed = schema.safeParse(urlValue)
      if (!parsed.success) {
        errors.push({ key, error: parsed.error })
        return [key, paramSchema.safeParse(undefined).data]
      }

      return [key, parsed.data]
    })
  ) as {
    [K in keyof T]: ReturnType<
      (O['allOptional'] extends false
        ? T[K]
        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
          T[K] extends z.ZodArray<any> | z.ZodDefault<any> | z.ZodEffects<any>
          ? T[K]
          : z.ZodOptional<T[K]>)['parse']
    >
  }

  return { data, errors }
}

type CleanUrlOptions<T extends string> = {
  removeUneededObjectParams?: boolean
  removeParams?: {
    [K in T]?: { if: 'another-is-unset'; prop: K } | { if: 'default' }
  }
}

/**
 * Parses the query params of the current URL with zod and stores the errors in the context.
 *
 * Wrong values are set to `undefined`, and the errors stored in `Astro.locals.banners`.
 *
 * @example
 * ```ts
 * const schema = {
 *   sizes: z.array(z.enum(['S', 'M', 'L', 'XL'])),
 *   'max-price': z.coerce.number(),
 *   'min-price': z.coerce.number().default(0),
 * }
 * const data = zodParseQueryParamsStoringErrors(schema, Astro)
 * // data:
 * // {
 * //   sizes: ['M', 'L'],
 * //   'max-price': undefined,
 * //   'min-price': 0
 * // }
 * // And 1 error stored in Astro.locals.banners (`max-price`).
 * ```
 */
export function zodParseQueryParamsStoringErrors<
  K extends string,
  T extends Record<K, MyZodUnknown>,
  O extends ZodParseFromUrlOptions & {
    ignoredKeysForDefaultData?: K[]
    cleanUrl?: CleanUrlOptions<K>
  },
  C extends Pick<APIContext | AstroGlobal | Readonly<APIContext> | Readonly<AstroGlobal>, 'locals' | 'url'>,
>(shape: T, context: C, options?: O) {
  const { data, errors } = zodParseQueryParams(shape, context.url.searchParams, options)
  context.locals.banners.add(
    ...errors.map(
      (error) =>
        ({
          uiMessage: `Error in the ${error.key} filter. Using default value.`,
          type: 'error',
          error: error.error,
          origin: 'custom_filters',
        }) as const
    )
  )

  const defaultDataWithoutIgnoringKeys = zodParseQueryParams(shape, new URLSearchParams(), options).data
  const defaultData = omit(defaultDataWithoutIgnoringKeys, options?.ignoredKeysForDefaultData ?? [])
  const hasDefaultData = areEqualObjectsWithoutOrder(
    omit(data, options?.ignoredKeysForDefaultData ?? []),
    defaultData
  )

  const redirectUrl = makeCleanUrl(shape, context.url, options?.cleanUrl, data, defaultData)

  return { data, defaultData, hasDefaultData, errors, schema: shape, redirectUrl }
}

function unwrapSchema<T extends MyZodUnknown>(
  schema: T,
  options: {
    default?: boolean
    optional?: boolean
    nullable?: boolean
    array?: boolean
  } = {}
) {
  if (options.default && schema instanceof z.ZodDefault) {
    return unwrapSchema((schema as z.ZodDefault<T>).removeDefault(), options)
  }
  if (options.optional && schema instanceof z.ZodOptional) {
    return unwrapSchema((schema as z.ZodOptional<T>).unwrap(), options)
  }
  if (options.nullable && schema instanceof z.ZodNullable) {
    return unwrapSchema((schema as z.ZodNullable<T>).unwrap(), options)
  }
  if (options.array && schema instanceof z.ZodArray) {
    return unwrapSchema((schema as z.ZodArray<T>).element, options)
  }

  return schema
}

function makeCleanUrl<K extends string, T extends Record<K, MyZodUnknown>>(
  shape: T,
  url: URL,
  options?: CleanUrlOptions<K>,
  data?: Record<K, unknown>,
  defaultData?: Record<string, unknown>
) {
  if (!options) return null

  const paramsToRemove = [
    ...(options.removeUneededObjectParams ? getUneededObjectParams(shape, url) : []),
    ...(options.removeParams ? getParamsToRemove(shape, url, options.removeParams, data, defaultData) : []),
  ]
  if (!paramsToRemove.length) return null

  const cleanUrl = new URL(url)
  paramsToRemove.forEach(([key, value]) => {
    cleanUrl.searchParams.delete(key, value)
  })
  return cleanUrl
}

function getUneededObjectParams<T extends Record<string, MyZodUnknown>>(shape: T, url: URL) {
  const objectParamsRegex = Object.entries(shape)
    .filter(([_key, paramSchema]) => {
      const schema = unwrapSchema(paramSchema, {
        default: true,
        optional: true,
        nullable: true,
      })
      return schema instanceof z.ZodObject || schema instanceof z.ZodRecord
    })
    .map(([key]) => makeObjectSearchParamKeyRegex(key))
  if (!objectParamsRegex.length) return []

  const uneededParams = url.searchParams
    .entries()
    .filter(([key, value]) => objectParamsRegex.some((regex) => regex.test(key)) && value === '')
    .toArray()

  return uneededParams
}

function getParamsToRemove<K extends string, T extends Record<K, MyZodUnknown>>(
  shape: T,
  url: URL,
  removeParams: NonNullable<CleanUrlOptions<K>['removeParams']>,
  data?: Record<K, unknown>,
  defaultData?: Record<K, unknown>
) {
  return url.searchParams
    .entries()
    .filter(([key]) => {
      const options = key in removeParams ? removeParams[key as K] : undefined
      if (!options) return false

      const paramSchema = key in shape ? shape[key as K] : undefined
      if (!paramSchema) return false

      switch (options.if) {
        case 'another-is-unset': {
          return !url.searchParams
            .keys()
            .some((key2) => key2 === options.prop || makeObjectSearchParamKeyRegex(options.prop).test(key2))
        }
        case 'default': {
          const dataValue = data && key in data ? data[key as K] : undefined
          const defaultDataValue = defaultData && key in defaultData ? defaultData[key as K] : undefined
          return isEqual(dataValue, defaultDataValue)
        }
        default: {
          return false
        }
      }
    })
    .toArray()
}
