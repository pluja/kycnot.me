import type { Graph, Thing, WithContext } from 'schema-dts'

export type JsonLdItem = Graph | WithContext<Thing>

// HTML entities are not decoded inside <script>, so the only safe way to keep
// "</script>" or "&" out of the markup is JSON's own unicode escapes.
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
