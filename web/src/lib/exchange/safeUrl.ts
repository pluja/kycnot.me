// Scheme guard for any upstream URL rendered as an href. Rejects
// javascript:, data:, and anything that isn't http(s). Does NOT validate
// the host.
export function safeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const parsed = new URL(raw)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href
    }
  } catch {
    // not a URL
  }
  return null
}
