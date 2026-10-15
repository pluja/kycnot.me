// META_DESCRIPTION_MAX_LENGTH is about where search results cut a description, mid-word.
const META_DESCRIPTION_MAX_LENGTH = 160

// fitSentences joins whole sentences while the total stays within maxLength. A slot may list variants
// from longest to shortest; the first that fits is used. The first slot that fits in no variant ends the
// description, so a later sentence never appears without the one it refers to.
export const fitSentences = (
  slots: (string[] | string | null | undefined)[],
  maxLength = META_DESCRIPTION_MAX_LENGTH
) => {
  let description = ''
  for (const slot of slots) {
    if (!slot) continue
    const variants = Array.isArray(slot) ? slot : [slot]
    const separatorLength = description ? 1 : 0
    const fitting = variants.find(
      (variant) => description.length + separatorLength + variant.length <= maxLength
    )
    if (!fitting) break
    description = description ? `${description} ${fitting}` : fitting
  }
  return description
}
