/**
 * Sets HTTP cache headers on a publicly cacheable page response.
 *
 * Anonymous, error-free responses get a short-lived public cache. Cloudflare
 * honors `s-maxage` at the edge so subsequent visitors hit the CDN instead of
 * the origin. `stale-while-revalidate` lets the CDN serve a stale copy while
 * refetching in the background, so visitors never wait on a cache miss.
 *
 * Authenticated requests and responses with active error banners get
 * `no-store` so personalized or broken HTML is never cached at any layer.
 */
export function setPublicPageCacheHeaders(
  headers: Headers,
  {
    isAuthenticated,
    hasErrors = false,
  }: { isAuthenticated: boolean; hasErrors?: boolean }
) {
  if (isAuthenticated || hasErrors) {
    headers.set('Cache-Control', 'private, no-store, no-cache, must-revalidate')
  } else {
    headers.set('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400')
  }
}
