import path from 'node:path'

// confineToRoot resolves child against root and returns null when the result
// escapes root. child may be relative or absolute; an absolute child that lands
// outside root is rejected rather than silently honoured.
export function confineToRoot(root: string, child: string): string | null {
  const fullPath = path.resolve(root, child)
  if (fullPath !== root && !fullPath.startsWith(root + path.sep)) {
    return null
  }
  return fullPath
}
