import { z } from 'astro:schema'

import { typedObjectEntries } from './objects'

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
interface JSONObject {
  [k: string]: JSONValue
}
type JSONList = JSONValue[]
type JSONPrimitive = boolean | number | string | null
type JSONValue = Date | JSONList | JSONObject | JSONPrimitive

function makeTypedLocalStorage<
  Schemas extends Record<string, z.ZodType<JSONValue>>,
  T extends {
    [K in keyof Schemas]: {
      schema: Schemas[K]
      default?: z.output<Schemas[K]> | undefined
      key?: string
    }
  },
>(options: T) {
  return Object.fromEntries(
    typedObjectEntries(options).map(([originalKey, option]) => {
      const key = option.key ?? originalKey

      return [
        key,
        {
          get: () => {
            const stringValue = localStorage.getItem(key)
            if (!stringValue) return option.default

            let jsonValue: z.output<typeof option.schema> | undefined = option.default
            try {
              jsonValue = JSON.parse(stringValue)
            } catch (error) {
              console.error(error)
              return option.default
            }

            const parsedValue = option.schema.safeParse(jsonValue)
            if (!parsedValue.success) {
              console.error(parsedValue.error)
              return option.default
            }

            return parsedValue.data
          },

          set: (value: z.input<typeof option.schema>) => {
            localStorage.setItem(key, JSON.stringify(value))
          },

          remove: () => {
            localStorage.removeItem(key)
          },

          default: option.default,
        },
      ]
    })
  ) as {
    [K in keyof T]: {
      get: () => z.output<T[K]['schema']> | (T[K] extends { default: infer D } ? D : undefined)
      set: (value: z.input<T[K]['schema']>) => void
      remove: () => void
      default: z.output<T[K]['schema']> | undefined
    }
  }
}

export const typedLocalStorage = makeTypedLocalStorage({
  pushNotificationsBannerDismissedAt: {
    schema: z.coerce.date(),
  },
})
