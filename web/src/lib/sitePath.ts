// resolveSitePath turns a path on this site into an absolute URL on origin. URL
// reads a path that opens with two slashes, or with a backslash, as a host name:
// a request for "//evil.example" would otherwise point the canonical link at
// another site, and "//%2e%2e%2f.env" makes URL throw mid-render. URL also drops
// leading spaces and control characters, and tabs and newlines anywhere, so those
// go first or "\t//evil.example" would still leave the site.
export function resolveSitePath(path: string, origin: string): string {
  let start = 0
  while (start < path.length && path.charCodeAt(start) <= 0x20) start++
  const cleaned = path.slice(start).replace(/[\t\n\r]/g, '')
  return new URL(cleaned.replace(/^[/\\]+/, '/'), origin).href
}
