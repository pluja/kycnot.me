export type DiffPart = { type: 'added' | 'removed' | 'same'; text: string }

// tokens keeps punctuation apart from words, so removing "crib" from "the crib." doesn't read as a new "the.".
const tokens = (text: string) => text.match(/[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu) ?? []

// diffWords compares two texts word by word (whitespace kept), longest common subsequence first.
export function diffWords(before: string, after: string): DiffPart[] {
  const a = tokens(before)
  const b = tokens(after)
  const width = b.length + 1
  const table = new Int32Array((a.length + 1) * width)
  const common = (i: number, j: number) => table[i * width + j] ?? 0
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * width + j] =
        a[i] === b[j] ? common(i + 1, j + 1) + 1 : Math.max(common(i + 1, j), common(i, j + 1))
    }
  }
  const parts: DiffPart[] = []
  const push = (type: DiffPart['type'], text = '') => {
    const last = parts.at(-1)
    if (last?.type === type) last.text += text
    else parts.push({ type, text })
  }
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push('same', a[i])
      i++
      j++
    } else if (common(i + 1, j) >= common(i, j + 1)) {
      push('removed', a[i++])
    } else {
      push('added', b[j++])
    }
  }
  while (i < a.length) push('removed', a[i++])
  while (j < b.length) push('added', b[j++])
  return parts
}
