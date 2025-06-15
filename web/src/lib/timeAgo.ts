import { addDays, differenceInDays, format, isBefore, isToday, isYesterday } from 'date-fns'
import TimeAgo from 'javascript-time-ago'
import en from 'javascript-time-ago/locale/en'

import { transformCase, type TransformCaseType } from './strings'

TimeAgo.addDefaultLocale(en)

export const timeAgo = new TimeAgo('en-US')

export type FormatDateShortOptions = {
  prefix?: boolean
  hourPrecision?: boolean
  daysUntilDate?: number | null
  caseType?: TransformCaseType
  hoursShort?: boolean
}

export function formatDateShort(
  date: Date,
  {
    prefix = true,
    hourPrecision = true,
    daysUntilDate = null,
    caseType,
    hoursShort = false,
  }: FormatDateShortOptions = {}
) {
  const text = (() => {
    if (isToday(date)) {
      if (hourPrecision) return timeAgo.format(date, hoursShort ? 'twitter-minute-now' : 'round-minute')
      return 'today'
    }
    if (isYesterday(date)) return 'yesterday'

    if (daysUntilDate && isBefore(date, addDays(new Date(), daysUntilDate))) {
      return timeAgo.format(date, 'round-minute')
    }

    const currentYear = new Date().getFullYear()
    const dateYear = date.getFullYear()
    const formattedDate = dateYear === currentYear ? format(date, 'MMM d') : format(date, 'MMM d, yyyy')
    return prefix ? `on ${formattedDate}` : formattedDate
  })()

  if (!caseType) return text

  return transformCase(text, caseType)
}

export function formatDaysAgo(approvedAt: Date) {
  const days = differenceInDays(new Date(), approvedAt)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days.toLocaleString()} days ago`
}
