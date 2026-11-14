import { listedServiceWhere } from './listedServices'
import { prisma } from './prisma'

const TTL_MS = 10 * 60 * 1000
const FAILURE_BACKOFF_MS = 30 * 1000

const loadBrowseCategories = async () => {
  const categories = await prisma.category.findMany({
    select: {
      name: true,
      slug: true,
      icon: true,
      _count: {
        select: { services: { where: listedServiceWhere } },
      },
    },
    orderBy: { name: 'asc' },
  })
  return categories
    .filter((category) => category._count.services > 0)
    .map((category) => ({
      name: category.name,
      slug: category.slug,
      icon: category.icon,
      serviceCount: category._count.services,
    }))
}

type BrowseCategory = Awaited<ReturnType<typeof loadBrowseCategories>>[number]

// The footer renders on every page, error pages included, so the list is shared
// for a few minutes and a failure is replayed briefly: during a database outage
// pages fail fast instead of each waiting out another connection timeout.
let cachedAt = 0
let cachedCategories: BrowseCategory[] | null = null
let pendingLoad: Promise<BrowseCategory[]> | null = null
let lastFailure: { at: number; error: unknown } | null = null

export async function getBrowseCategories(): Promise<BrowseCategory[]> {
  if (cachedCategories !== null && Date.now() - cachedAt < TTL_MS) return cachedCategories
  if (lastFailure && Date.now() - lastFailure.at < FAILURE_BACKOFF_MS) throw lastFailure.error
  pendingLoad ??= loadBrowseCategories()
    .then((categories) => {
      cachedCategories = categories
      cachedAt = Date.now()
      lastFailure = null
      return categories
    })
    .catch((error: unknown) => {
      lastFailure = { at: Date.now(), error }
      throw error
    })
    .finally(() => {
      pendingLoad = null
    })
  return await pendingLoad
}
