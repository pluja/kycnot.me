import { z } from 'astro/zod'
import { map, xor, some, every } from 'lodash-es'

/**
 * Returns a tuple of values from a tuple of records.
 *
 * @example
 * TupleValues<'value', [{ value: 'a' }, { value: 'b' }]> // -> ['a', 'b']
 */
type TupleValues<K extends string, T extends readonly Record<K, string>[]> = {
  [I in keyof T]: T[I][K]
}

/**
 * Returns a tuple of values from a tuple of records.
 *
 * @example
 * const options = [{ value: 'a' }, { value: 'b' }]
 * const values = getTupleValues(options, 'value') // -> ['a', 'b']
 */
export function getTupleValues<K extends string, T extends readonly Record<K, string>[]>(
  arr: T,
  key: K
): TupleValues<K, T> {
  return map(arr, key) as unknown as TupleValues<K, T>
}

/**
 * Returns a zod enum from a constant.
 *
 * @example
 * const options = [{ value: 'a' }, { value: 'b' }]
 * const zodEnum = zodEnumFromConstant(options, 'value') // -> z.enum(['a', 'b'])
 */
export function zodEnumFromConstant<K extends string, T extends readonly Record<K, string>[]>(
  arr: T,
  key: K
) {
  return z.enum(getTupleValues(arr as unknown as [T[number], ...T[number][]], key))
}

/**
 * Returns a random element from an array.
 *
 * @example
 * const options = ['a', 'b']
 * const randomElement = getRandomElement(options) // -> 'a' or 'b'
 */
export function getRandom<T>(array: readonly T[]): T {
  return array[Math.floor(Math.random() * array.length)] as T
}

/**
 * Typed version of Array.prototype.join.
 *
 * @example
 * TypedJoin<['a', 'b']> // -> 'ab'
 * TypedJoin<['a', 'b'], '-'> // -> 'a-b'
 */
type TypedJoin<
  T extends readonly string[],
  Separator extends string = '',
  First extends boolean = true,
> = T extends readonly []
  ? ''
  : T extends readonly [infer U extends string, ...infer R extends readonly string[]]
    ? `${First extends true ? '' : Separator}${U}${TypedJoin<R, Separator, false>}`
    : string

/**
 * Joins an array of strings with a separator.
 *
 * @example
 * const options = ['a', 'b'] as const
 * const joined = typedJoin(options) // -> 'ab'
 * const joinedWithSeparator = typedJoin(options, '-') // -> 'a-b'
 */
export function typedJoin<T extends readonly string[], Separator extends string = ''>(
  array: T,
  separator: Separator = '' as Separator
) {
  return array.join(separator) as TypedJoin<T, Separator>
}

/**
 * Checks if two or more arrays are equal without considering order.
 *
 * @example
 * const a = [1, 2, 3]
 * const b = [3, 2, 1]
 * areEqualArraysWithoutOrder(a, b) // -> true
 */
export function areEqualArraysWithoutOrder<T>(...arrays: (T[] | null | undefined)[]): boolean {
  return xor(...arrays).length === 0
}

/**
 * Checks if some but not all of the arguments are true.
 *
 * @example
 * someButNotAll(true, false, true) // -> true
 * someButNotAll(true, true, true) // -> false
 * someButNotAll(false, false, false) // -> false
 */
export const someButNotAll = (...args: boolean[]) => some(args) && !every(args)

/**
 * Returns undefined if the array is empty.
 *
 * @example
 * const a = [1, 2, 3]
 * const b = []
 * const c = null
 * const d = undefined
 * undefinedIfEmpty(a) // -> [1, 2, 3]
 * undefinedIfEmpty(b) // -> undefined
 * undefinedIfEmpty(c) // -> undefined
 * undefinedIfEmpty(d) // -> undefined
 */
export function undefinedIfEmpty<T>(value: T) {
  return (value && Array.isArray(value) && value.length > 0 ? value : undefined) as T extends (infer U)[]
    ? U[] | undefined
    : T extends readonly [...infer U]
      ? U | undefined
      : undefined
}

export function isNotArray<T>(value: T | T[]): value is T {
  return !Array.isArray(value)
}
