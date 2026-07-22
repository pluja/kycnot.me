import path from 'node:path'

// PUBLIC_UPLOAD_PREFIXES are the upload subtrees the unauthenticated /files and
// /_image routes may serve. Anything outside them (e.g. `cases/` evidence) is
// access-controlled and served by a route that checks the viewer. The allow-list
// defaults any new upload type to private.
export const PUBLIC_UPLOAD_PREFIXES = ['services/', 'users/', 'evidence/'] as const

// isPublicUploadSubpath reports whether an upload subpath (the part after
// `/files/`, e.g. `services/pictures/x.png`) may be served publicly. The path is
// normalized first so a traversal such as `evidence/../cases/x` — which resolves
// into the private subtree but textually starts with a public prefix — cannot
// slip past the check.
export function isPublicUploadSubpath(subpath: string): boolean {
  const normalized = path.posix.normalize(subpath)
  if (path.posix.isAbsolute(normalized) || normalized === '..' || normalized.startsWith('../')) {
    return false
  }
  return PUBLIC_UPLOAD_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}
