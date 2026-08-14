import path from 'node:path'

// confineToRoot resolves child against root and returns null when the result
// escapes root. child may be relative or absolute; an absolute child that lands
// outside root is rejected rather than silently honoured. root is normalized
// first, so a trailing slash or a dot segment in it cannot fail every input
// closed.
export function confineToRoot(root: string, child: string): string | null {
  const resolvedRoot = path.resolve(root)
  const fullPath = path.resolve(resolvedRoot, child)
  if (fullPath !== resolvedRoot && !fullPath.startsWith(resolvedRoot + path.sep)) {
    return null
  }
  return fullPath
}
