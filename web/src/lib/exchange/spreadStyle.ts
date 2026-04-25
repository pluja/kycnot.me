// Traffic-light palette for spread percentages. Lower is better; negative
// means the provider beats the reference rate (strongest green).
const TIERS = [
  { max: 0, text: 'text-emerald-300', pill: 'bg-emerald-500/15 text-emerald-300' },
  { max: 0.1, text: 'text-green-300', pill: 'bg-green-500/15 text-green-300' },
  { max: 1, text: 'text-lime-300', pill: 'bg-lime-500/15 text-lime-300' },
  { max: 2.5, text: 'text-yellow-300', pill: 'bg-yellow-500/15 text-yellow-300' },
  { max: 5, text: 'text-orange-300', pill: 'bg-orange-500/15 text-orange-300' },
  { max: Infinity, text: 'text-red-300', pill: 'bg-red-500/15 text-red-300' },
] as const

function tierFor(percent: number): (typeof TIERS)[number] {
  for (const t of TIERS) if (percent <= t.max) return t
  // The Infinity sentinel guarantees the loop returns; this branch only
  // narrows the return type for the compiler.
  return TIERS[TIERS.length - 1] ?? TIERS[0]
}

export function spreadColorClass(percent: number): string {
  return tierFor(percent).text
}

export function spreadPillClass(percent: number): string {
  return tierFor(percent).pill
}
