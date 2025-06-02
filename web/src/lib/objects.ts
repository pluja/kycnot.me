/* eslint-disable @typescript-eslint/no-explicit-any */
import { isEqualWith } from 'lodash-es'

import { areEqualArraysWithoutOrder } from './arrays'

import type { Prettify } from 'ts-essentials'
import type TB from 'ts-toolbelt'

export function removeUndefined(obj: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))
}

type RemoveUndefinedProps<T extends Record<string, unknown>> = {
  [key in keyof T]-?: Exclude<T[key], undefined>
}

/**
 * Assigns properties from `obj2` to `obj1`, but only if they are defined in `obj2`.
 * @example
 * assignDefinedOnly({ a: 1, b: 2}, { a: undefined, b: 3, c: 4 }) // result = { a: 1, b: 3, c: 4 }
 */
export const assignDefinedOnly = <T1 extends Record<string, unknown>, T2 extends Record<string, unknown>>(
  obj1: T1,
  obj2: T2
) => {
  return { ...obj1, ...removeUndefined(obj2) } as Omit<RemoveUndefinedProps<T2>, keyof T1> &
    Omit<T1, keyof T2> & {
      [key in keyof T1 & keyof T2]-?: undefined extends T2[key]
        ? Exclude<T2[key], undefined> | T1[key]
        : T2[key]
    }
}

export type Paths<T> = T extends object
  ? {
      [K in keyof T]: `${Exclude<K, symbol>}${'' | `.${Paths<T[K]>}`}`
    }[keyof T]
  : never

export type PathValue<T, K extends string> = TB.Object.Path<T, TB.String.Split<K, '.'>>

export type Leaves<T> = T extends object
  ? {
      [K in keyof T]: `${Exclude<K, symbol>}${Leaves<T[K]> extends never ? '' : `.${Leaves<T[K]>}`}`
    }[keyof T]
  : never

// Start of paths with nested
type Digit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
type NextDigit = [1, 2, 3, 4, 5, 6, 7, 'STOP']
type Inc<T> = T extends Digit ? NextDigit[T] : 'STOP'
type StringOrNumKeys<TObj> = TObj extends unknown[] ? 0 : string & keyof TObj
type NestedPath<TValue, Prefix extends string, TValueNestedChild, TDepth> = TValue extends object
  ? `${Prefix}.${TDepth extends 'STOP' ? string : NestedFieldPaths<TValue, TValueNestedChild, TDepth>}`
  : never
type GetValue<T, K extends number | string> = T extends unknown[]
  ? K extends number
    ? T[K]
    : never
  : K extends keyof T
    ? T[K]
    : never
type NestedFieldPaths<TData = any, TValue = any, TDepth = 0> = {
  [TKey in StringOrNumKeys<TData>]:
    | NestedPath<GetValue<TData, TKey>, `${TKey}`, TValue, Inc<TDepth>>
    | (GetValue<TData, TKey> extends TValue ? `${TKey}` : never)
}[StringOrNumKeys<TData>]
export type PathsWithNested<TData = any> = TData extends any ? NestedFieldPaths<TData, any, 1> : never
// End of paths with nested

export type TypedGroupBy<K extends string, T extends Record<K, string> & Record<string, unknown>> = {
  [Id in T[K]]: Extract<T, Record<K, Id>>
}

/**
 * Converts an array of objects to an object with the key as the id and the value as the object.
 * @example
 * typedGroupBy([
 *   { id: 'a', name: 'Letter A' },
 *   { id: 'b', name: 'Letter B' }
 * ] as const, 'id')
 *  // result = {
 *  //   a: { id: 'a', name: 'Letter A' },
 *  //   b: { id: 'b', name: 'Letter B' }
 *  // }
 */
export const typedGroupBy = <K extends string, T extends Record<K, string> & Record<string, unknown>>(
  array: T[] | readonly T[],
  key: K
) => {
  return Object.fromEntries(array.map((option) => [option[key], option])) as TypedGroupBy<K, T>
}

/**
 * Merges two objects, so that each property is the union of that property from each object.
 * - If a key is present in only one of the objects, it becomes optional.
 * - If an object is undefined, the other object is returned.
 *
 * To {@link UnionizeTwo} more than two objects, use {@link Unionize}.
 *
 * @example
 * UnionizeTwo<{ a: 1, shared: 1 }, { b: 2, shared: 2 }> // { a?: 1, b?: 2, shared: 1 | 2 }
 */
export type UnionizeTwo<
  T1 extends Record<string, unknown> | undefined,
  T2 extends Record<string, unknown> | undefined,
> = keyof T1 extends undefined
  ? T2
  : keyof T2 extends undefined
    ? T1
    : {
        [K in Exclude<keyof T1 | keyof T2, keyof T1 & keyof T2>]+?:
          | (K extends keyof T1 ? T1[K] : never)
          | (K extends keyof T2 ? T2[K] : never)
      } & {
        [K in keyof T1 & keyof T2]-?: T1[K] | T2[K]
      }

/**
 * Merges multiple objects, so that each property is the union of that property from each object.
 * - If a key is present in only one of the objects, it becomes optional.
 * - If an object is undefined, it is ignored.
 * - If no objects are provided, `undefined` is returned.
 *
 * Internally, it uses {@link UnionizeTwo} recursively.
 *
 * @example
 * Unionize<[
 *   { a: 1, shared: 1 },
 *   { b: 2, shared: 2 },
 *   { a: 3, shared: 3 }
 * ]>
 * // result = {
 * //   a?: 1 | 3,
 * //   b?: 2,
 * //   shared: 1 | 2 | 3
 * // }
 */
export type Unionize<T extends Record<string, unknown>[]> = Prettify<
  T extends []
    ? undefined
    : T extends [infer First, ...infer Rest]
      ? Rest extends Record<string, unknown>[]
        ? First extends Record<string, unknown>
          ? UnionizeTwo<First, Unionize<Rest>>
          : undefined
        : First
      : undefined
>

/**
 * Checks if two objects are equal without considering order in arrays.
 * @example
 * areEqualObjectsWithoutOrder({ a: [1, 2], b: 3 }, { b: 3, a: [2, 1] }) // true
 */
export function areEqualObjectsWithoutOrder<T extends Record<string, unknown>>(
  a: T,
  b: Record<string, unknown>
): b is T {
  return isEqualWith(a, b, (a, b) => {
    if (Array.isArray(a) && Array.isArray(b)) return areEqualArraysWithoutOrder(a, b)
    return undefined
  })
}

/**
 * Same as {@link Object.entries}, but with proper typing.
 * @example
 * typedObjectEntries({ a: 1, b: 2 }) // [['a', 1], ['b', 2]]
 */
export function typedObjectEntries<T extends Record<string, unknown>>(obj: T) {
  return Object.entries(obj) as Prettify<
    {
      [K in Extract<keyof T, string>]: [K, T[K]]
    }[Extract<keyof T, string>]
  >[]
}
