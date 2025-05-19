import { uniqBy } from 'lodash-es'

import { zodEnumFromConstant } from './arrays'
import { typedGroupBy, type TypedGroupBy } from './objects'

import type { ZodEnum } from 'astro/zod'

/**
 * Creates utility functions to work with an array of options.
 * Primarily a `getFn` and `useGetHook`, that return the option object based on the key, or a fallback value if the key is not found.
 *
 * @param dataArray - Array of objects, must be defined using `as const` to ensure type safety.
 * @param key - The key to group the array by
 */
export function makeHelpersForOptions<
  K extends string,
  Fallback extends Record<K, string | null | undefined> &
    Record<string, unknown> & { slug?: string | null | undefined },
  TArray extends readonly (Fallback & Record<K, string>)[],
  HasSlugs extends boolean = TArray extends Record<'slug', string>[] ? true : false,
>(key: K, makeFallback: (key: string | null | undefined) => Fallback, dataArray: TArray) {
  const hasDuplicateIds = uniqBy(dataArray, key).length !== dataArray.length
  if (hasDuplicateIds) {
    throw new Error(`[makeHelpersForOptions] Duplicate ${key} in dataArray`)
  }

  const hasSlugs = dataArray.some((item) => 'slug' in item && typeof item.slug === 'string')
  const allSlugsAreDefined = dataArray.every((item) => 'slug' in item && typeof item.slug === 'string')
  if (hasSlugs) {
    if (!allSlugsAreDefined) {
      throw new Error('[makeHelpersForOptions] Some slugs are missing in dataArray')
    }

    const hasDuplicateSlugs = uniqBy(dataArray, 'slug').length !== dataArray.length
    if (hasDuplicateSlugs) {
      throw new Error('[makeHelpersForOptions] Duplicate slug in dataArray')
    }
  }

  const dataObject = typedGroupBy<K, TArray[number]>(dataArray, key)
  const dataObjectBySlug = (
    allSlugsAreDefined
      ? typedGroupBy(dataArray as TArray extends Record<'slug', string>[] ? TArray : never, 'slug')
      : undefined
  ) as HasSlugs extends true
    ? TypedGroupBy<'slug', TArray extends Record<'slug', string>[] ? TArray[number] : never>
    : undefined

  function getFn<T extends TArray[number][K]>(id: T): Extract<TArray[number], Record<K, T>>
  function getFn<T extends string | null | undefined>(id: T): Extract<TArray[number], Record<K, T>> | Fallback
  function getFn<T extends string | null | undefined>(
    id: T
  ): Extract<TArray[number], Record<K, T>> | Fallback {
    return typeof id === 'string' && id in dataObject
      ? dataObject[id as unknown as keyof typeof dataObject]
      : makeFallback(id)
  }

  function getFnSlug<T extends TArray[number]['slug']>(slug: T): Extract<TArray[number], Record<'slug', T>>
  function getFnSlug<T extends string | null | undefined>(
    slug: T
  ): Extract<TArray[number], Record<'slug', T>> | Fallback
  function getFnSlug<T extends string | null | undefined>(
    slug: T
  ): Extract<TArray[number], Record<'slug', T>> | Fallback {
    return typeof slug === 'string' && dataObjectBySlug && slug in dataObjectBySlug
      ? (dataObjectBySlug as NonNullable<typeof dataObjectBySlug>)[
          slug as unknown as keyof NonNullable<typeof dataObjectBySlug>
        ]
      : makeFallback(null)
  }

  // const useGetHook: typeof getFn = ((status: any) => {
  //   return useMemo(() => getFn(status), [status])
  // }) as typeof getFn

  const exposedMakeFallback = <O extends Omit<Partial<Fallback>, K>>(
    id: Parameters<typeof makeFallback>[0],
    options?: O
  ) => {
    return {
      ...makeFallback(id),
      ...options,
    } as Fallback & O
  }

  const zodEnumById = zodEnumFromConstant(dataArray, key)
  const zodEnumBySlug = (
    allSlugsAreDefined
      ? zodEnumFromConstant(dataArray as TArray extends Record<'slug', string>[] ? TArray : never, 'slug')
      : undefined
  ) as HasSlugs extends true ? ZodEnum<[TArray[number]['slug'], ...TArray[number]['slug'][]]> : undefined

  function slugToKey<T extends TArray[number]['slug']>(slug: T): Extract<TArray[number], Record<'slug', T>>[K]
  function slugToKey<T extends string | null | undefined>(
    slug: T
  ): Extract<TArray[number], Record<'slug', T>>[K] | undefined
  function slugToKey<T extends string | null | undefined>(
    slug: T
  ): Extract<TArray[number], Record<'slug', T>>[K] | undefined {
    return typeof slug === 'string' && dataObjectBySlug && slug in dataObjectBySlug
      ? ((dataObjectBySlug as NonNullable<typeof dataObjectBySlug>)[
          slug as unknown as keyof NonNullable<typeof dataObjectBySlug>
        ][key] as unknown as Extract<TArray[number], Record<'slug', T>>[K])
      : undefined
  }

  function keyToSlug<T extends TArray[number][K]>(slug: T): Extract<TArray[number], Record<K, T>>['slug']
  function keyToSlug<T extends string | null | undefined>(
    slug: T
  ): Extract<TArray[number], Record<K, T>>['slug'] | undefined
  function keyToSlug<T extends string | null | undefined>(
    slug: T
  ): Extract<TArray[number], Record<K, T>>['slug'] | undefined {
    return typeof slug === 'string' && slug in dataObject
      ? (dataObject[slug as unknown as keyof NonNullable<typeof dataObject>][key] as unknown as Extract<
          TArray[number],
          Record<K, T>
        >['slug'])
      : undefined
  }

  return {
    dataArray,
    dataObject,
    /** Gets the info by key, if not found, returns a fallback value */
    getFn,
    /** Gets the info by key, if not found, returns a fallback value */
    // useGetHook: useGetHook,
    /** Generates a fallback value */
    makeFallback: exposedMakeFallback,
    zodEnumById,

    dataObjectBySlug,
    /** Gets the info by slug, if not found, returns a fallback value */
    getFnSlug,
    zodEnumBySlug,

    /** Gets the id by slug, if not found, returns undefined */
    slugToKey,
    /** Gets the slug by id, if not found, returns undefined */
    keyToSlug,
  }
}
