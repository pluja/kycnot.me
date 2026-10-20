export function commentReviewSignals(content: string) {
  const contactPattern =
    /[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:at|@)\s*[-.[\]()]*\s*(?:gmail|protonmail|proton|outlook|hotmail|yahoo)\s*[-.\s[\]()]+(?:dot\s+)?(?:com|me)\b/gi
  const slurPattern = /\br[e3]t[a4]rd(?:[e3]d|s)?\b/gi
  const contactMatches = [...content.matchAll(contactPattern)]
  const recoveryOffer = /\b(?:recover(?:y|ed|ing)?|refund(?:ed)?)\b/i.test(content)
  const matches = [
    ...contactMatches.map((match) => ({
      start: match.index,
      end: match.index + match[0].length,
      reason: recoveryOffer ? 'Possible recovery solicitation' : 'Contact details in comment',
    })),
    ...[...content.matchAll(slurPattern)].map((match) => ({
      start: match.index,
      end: match.index + match[0].length,
      reason: 'Possible slur',
    })),
  ].sort((left, right) => left.start - right.start)
  const parts: { text: string; reason?: string }[] = []
  let cursor = 0
  for (const match of matches) {
    if (match.start < cursor) continue
    parts.push({ text: content.slice(cursor, match.start) })
    parts.push({ text: content.slice(match.start, match.end), reason: match.reason })
    cursor = match.end
  }
  parts.push({ text: content.slice(cursor) })
  return { parts, reasons: [...new Set(matches.map((match) => match.reason))] }
}
