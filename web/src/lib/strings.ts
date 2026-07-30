/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Normalize a string by removing accents and converting it to lowercase.
 *
 * @example
 * normalize(' Café') // 'cafe'
 */
const normalize = (str: string): string => {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Flatten markdown to a single line of plain text, for excerpts and previews.
 * Link text survives, the target is dropped.
 *
 * @example
 * stripMarkdown('## See [docs](https://x.dev)\n\n**now**') // 'See docs now'
 */
export const stripMarkdown = (markdown: string): string => {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#*_`>~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Compare two strings after normalizing them.
 */
export const areSameNormalized = (str1: string, str2: string): boolean => {
  return normalize(str1) === normalize(str2)
}

export type TransformCaseType = 'first-upper' | 'lower' | 'original' | 'sentence' | 'title' | 'upper'

/**
 * Transform a string to a different case.
 *
 * @example
 * transformCase('hello WORLD', 'lower') // 'hello world'
 * transformCase('hello WORLD', 'upper') // 'HELLO WORLD'
 * transformCase('hello WORLD', 'sentence') // 'Hello world'
 * transformCase('hello WORLD', 'title') // 'Hello World'
 * transformCase('hello WORLD', 'original') // 'hello WORLD'
 * transformCase('Hello WORLD', 'first-upper') // 'Hello WORLD'
 */
export const transformCase = <T extends string, C extends TransformCaseType>(
  str: T,
  caseType: C
): C extends 'lower'
  ? Lowercase<T>
  : C extends 'upper'
    ? Uppercase<T>
    : C extends 'sentence'
      ? Capitalize<Lowercase<T>>
      : C extends 'title'
        ? Capitalize<Lowercase<T>>
        : C extends 'first-upper'
          ? Capitalize<T>
          : T => {
  if (typeof str !== 'string') {
    console.error(
      `[transformCase] Expected string, got ${typeof str}. str=${String(str)} caseType='${caseType}'`
    )
    console.trace()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return ((str as unknown) === null || (str as unknown) === undefined ? '' : String(str as unknown)) as any
  }

  switch (caseType) {
    case 'lower':
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return str.toLowerCase() as any
    case 'upper':
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return str.toUpperCase() as any
    case 'sentence':
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return (str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()) as any
    case 'first-upper':
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return (str.charAt(0).toUpperCase() + str.slice(1)) as any
    case 'title':
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return str
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ') as any
    case 'original':
    default:
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return str as any
  }
}
