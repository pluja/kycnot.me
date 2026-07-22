// Case evidence lives under the private `cases/` upload subtree and must never
// be reachable through the unauthenticated /files or /_image routes. It is
// served instead by /case-media, which re-checks the viewer's case visibility.

const CASES_FILES_PREFIX = '/files/cases/'
const CASE_MEDIA_PREFIX = '/case-media/'

// caseEvidenceMediaUrl maps a stored evidence imageUrl (`/files/cases/<id>/<f>`)
// to its access-checked serving URL (`/case-media/<id>/<f>`). A url that is not
// a case-evidence upload is returned unchanged.
export function caseEvidenceMediaUrl(imageUrl: string): string {
  if (!imageUrl.startsWith(CASES_FILES_PREFIX)) return imageUrl
  return CASE_MEDIA_PREFIX + imageUrl.slice(CASES_FILES_PREFIX.length)
}
