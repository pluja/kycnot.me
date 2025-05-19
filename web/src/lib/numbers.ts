import { round } from 'lodash-es'

export function parseIntWithFallback<F = null>(value: unknown, fallback: F = null as F) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) return fallback
  return parsed
}

/**
 * Interpolates a value between a start and end value.
 * @param value - The value to interpolate.
 * @param start - The start value.
 * @param end - The end value.
 * @returns The interpolated value.
 */
export function interpolate(value: number, start: number, end: number) {
  return start + (end - start) * value
}

export type FormatNumberOptions = Intl.NumberFormatOptions & {
  roundDigits?: number
  showSign?: boolean
  removeTrailingZeros?: boolean
}

export function formatNumber(
  value: number,
  { roundDigits = 0, showSign = true, removeTrailingZeros = true, ...formatOptions }: FormatNumberOptions = {}
) {
  const rounded = round(value, roundDigits)
  const formatted = rounded.toLocaleString(undefined, formatOptions)
  const withoutTrailingZeros = removeTrailingZeros ? formatted.replace(/\.0+$/, '') : formatted
  const withSign = showSign && value > 0 ? `+${withoutTrailingZeros}` : withoutTrailingZeros
  return withSign
}
