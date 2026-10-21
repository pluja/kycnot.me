import type { ExperienceSummaryData, SentimentCounts } from './experienceQueries'

export type VerdictTone = 'bad' | 'caution' | 'good'
export type Verdict = { label: string; tone: VerdictTone }

// minimumVerdictPosts and minimumCheckedBasis are the floors below which a verdict word would rest on a
// post or two, and one friendly customer could set it.
export const minimumVerdictPosts = 3
export const minimumCheckedBasis = 5

const rated = (counts: SentimentCounts) => counts.positive + counts.neutral + counts.negative

// mostlyNegativeShare warns early: half the experiences being negative is enough. mostlyPositiveShare applies to the
// positive share with each mixed experience counted as half positive, since it is neither praise nor a complaint.
export const mostlyNegativeShare = 0.5
export const mostlyPositiveShare = 0.75

// sentimentVerdict needs enough rated posts, then reads the shares from weights, where a newcomer's unproven post
// counts half.
export function sentimentVerdict(counts: SentimentCounts, weights: SentimentCounts = counts): Verdict | null {
  if (rated(counts) < minimumVerdictPosts) return null
  const total = rated(weights)
  if (weights.negative / total >= mostlyNegativeShare) return { label: 'Mostly negative', tone: 'bad' }
  if ((weights.positive + weights.neutral / 2) / total >= mostlyPositiveShare) {
    return { label: 'Mostly positive', tone: 'good' }
  }
  return { label: 'Mixed', tone: 'caution' }
}

// verdictCounts are the experiences with checked proof when enough have it, so a wave of unproven posts
// can't move the verdict. With fewer, every post counts; the brigade checks already screen unproven ones.
export function verdictCounts(summary: ExperienceSummaryData) {
  const checkedOnly = summary.checked.total >= minimumCheckedBasis && summary.checked.total < summary.total
  return { counts: checkedOnly ? summary.checked : summary.all, checkedOnly }
}

export function summaryVerdict(summary: ExperienceSummaryData) {
  const { counts, checkedOnly } = verdictCounts(summary)
  return checkedOnly ? sentimentVerdict(counts) : sentimentVerdict(counts, summary.weighted)
}
