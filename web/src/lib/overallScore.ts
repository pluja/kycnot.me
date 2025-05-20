export function makeOverallScoreInfo(score: number, total = 10) {
  const classNamesByColor = {
    red: 'bg-score-1 text-black',
    orange: 'bg-score-2 text-black',
    yellow: 'bg-score-3 text-black',
    blue: 'bg-score-4 text-black',
    green: 'bg-score-5 text-black',
  } as const satisfies Record<string, string>

  const formattedScore = Math.round(score).toLocaleString()
  const n = score / total

  if (n > 1) return { text: '', classNameBg: classNamesByColor.green, formattedScore }
  if (n >= 0.9 && n <= 1) return { text: 'Excellent', classNameBg: classNamesByColor.green, formattedScore }
  if (n >= 0.8 && n < 0.9) return { text: 'Very Good', classNameBg: classNamesByColor.blue, formattedScore }
  if (n >= 0.7 && n < 0.8) return { text: 'Good', classNameBg: classNamesByColor.blue, formattedScore }
  if (n >= 0.6 && n < 0.7) return { text: 'Okay', classNameBg: classNamesByColor.yellow, formattedScore }
  if (n >= 0.5 && n < 0.6) {
    return { text: 'Acceptable', classNameBg: classNamesByColor.yellow, formattedScore }
  }
  if (n >= 0.4 && n < 0.5) return { text: 'Bad', classNameBg: classNamesByColor.orange, formattedScore }
  if (n >= 0.3 && n < 0.4) return { text: 'Very Bad', classNameBg: classNamesByColor.orange, formattedScore }
  if (n >= 0.2 && n < 0.3) return { text: 'Really Bad', classNameBg: classNamesByColor.red, formattedScore }
  if (n >= 0 && n < 0.2) return { text: 'Terrible', classNameBg: classNamesByColor.red, formattedScore }
  return { text: '', classNameBg: undefined, formattedScore }
}
