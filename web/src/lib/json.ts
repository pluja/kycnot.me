import type { z } from 'astro:content'

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
interface JSONObject {
  [k: string]: JSONValue
}
type JSONList = JSONValue[]
type JSONPrimitive = boolean | number | string | null
type JSONValue = Date | JSONList | JSONObject | JSONPrimitive

export type ZodJSON = z.ZodType<JSONValue>

export function zodParseJSON<T extends z.ZodType<JSONValue>, D extends z.output<T> | undefined = undefined>(
  schema: T,
  stringValue: string | null | undefined,
  defaultValue?: D
): D | z.output<T> {
  if (!stringValue) return defaultValue as D

  let jsonValue: D | z.output<typeof schema> = defaultValue as D
  try {
    jsonValue = JSON.parse(stringValue)
  } catch (error) {
    console.error(error)
    return defaultValue as D
  }

  const parsedValue = schema.safeParse(jsonValue)
  if (!parsedValue.success) {
    console.error(parsedValue.error)
    return defaultValue as D
  }

  return parsedValue.data
}
