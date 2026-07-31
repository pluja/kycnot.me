/**
 * Format a date for a `datetime-local` input, which expects local wall time
 * with no timezone suffix.
 */
export const toDatetimeLocalValue = (date: Date): string =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
