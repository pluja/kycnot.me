export const SITE_NAME = 'KYCnot.me'

/** What `BaseHead` appends to every `pageTitle` in production. */
export const PAGE_TITLE_SUFFIX = ` | ${SITE_NAME}`

/**
 * Budget for a page's own title, before {@link PAGE_TITLE_SUFFIX} is appended.
 *
 * Google truncates around 600px, roughly 60-68 characters of mixed-case text,
 * so a page that spends its whole budget still renders in full once the brand
 * suffix lands. Pages that build a title from data should degrade through
 * shorter candidates rather than overflow.
 */
export const MAX_PAGE_TITLE_LENGTH = 55

/**
 * First candidate that fits the budget, else the last.
 *
 * Candidates are ordered most to least descriptive, so the last one is the
 * shortest form the page is willing to fall back to.
 */
export function fitPageTitle(candidates: string[]): string {
  return candidates.find((candidate) => candidate.length <= MAX_PAGE_TITLE_LENGTH) ?? candidates.at(-1) ?? ''
}
