import type { Graph, Thing, WithContext } from 'schema-dts'

export type JsonLdItem = Graph | WithContext<Thing>

// UNSAFE_IN_SCRIPT maps characters to JSON's own unicode escapes: HTML entities are not decoded inside
// <script>, so that is the only safe way to keep "</script>" or "&" out of the markup.
const UNSAFE_IN_SCRIPT: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
}

export function serializeJsonLd(item: JsonLdItem): string {
  return JSON.stringify(item).replace(/[<>&\u2028\u2029]/g, (char) => UNSAFE_IN_SCRIPT[char] ?? char)
}
