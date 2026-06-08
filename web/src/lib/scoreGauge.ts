import { interpolate } from './numbers'

export function makeScoreGaugeInfo(score: number, total = 100) {
  const formattedScore = Math.round(score).toLocaleString()
  const progress = total === 0 ? 0 : Math.min(Math.max(score / total, 0), 1)
  const angle = interpolate(progress, -100, 100)
  const n = score / total

  if (n > 1) return { text: 'Excellent', step: 5, formattedScore, angle: 100 }
  if (n >= 0.9 && n <= 1) return { text: 'Excellent', step: 5, formattedScore, angle }
  if (n >= 0.8 && n < 0.9) return { text: 'Very Good', step: 5, formattedScore, angle }
  if (n >= 0.6 && n < 0.8) return { text: 'Good', step: 4, formattedScore, angle }
  if (n >= 0.45 && n < 0.6) return { text: 'Average', step: 3, formattedScore, angle }
  if (n >= 0.4 && n < 0.45) return { text: 'Average', step: 3, formattedScore, angle: angle + 5 }
  if (n >= 0.2 && n < 0.4) return { text: 'Bad', step: 2, formattedScore, angle: angle + 5 }
  if (n >= 0.1 && n < 0.2) return { text: 'Very Bad', step: 1, formattedScore, angle }
  if (n >= 0 && n < 0.1) return { text: 'Terrible', step: 1, formattedScore, angle }
  if (n < 0) return { text: 'Terrible', step: 1, formattedScore, angle: -100 }

  return { text: '', step: undefined, formattedScore, angle: undefined }
}
