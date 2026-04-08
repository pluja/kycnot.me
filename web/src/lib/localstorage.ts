import { z } from 'astro/zod'

import { zodParseJSON, type ZodJSON } from './json'
import { typedObjectEntries } from './objects'

function makeTypedLocalStorage<
  Schemas extends Record<string, ZodJSON>,
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
            return zodParseJSON(option.schema, localStorage.getItem(key), option.default)
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
  browserNotificationsEnabled: {
    schema: z.boolean(),
    default: false,
  },
})
