/**
 * Gives an error if the type is not equal to 1.
 *
 * @example
 * ```ts
 * type _ExpectEquals = Assert<Equals<'a' | 'b', 'a'>> // Gives an error
 * type _ExpectEquals = Assert<Equals<'a' | 'b', 'b' | 'a'>> // No error
 * ```
 */
export type Assert<T extends 1> = T
