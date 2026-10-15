export const DELETED_ACCOUNT_LABEL = 'Deleted account'

export const authorDisplayName = (author: { name: string; displayName: string | null } | null) =>
  author ? (author.displayName ?? author.name) : DELETED_ACCOUNT_LABEL
