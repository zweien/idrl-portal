import type { NewsItem, Resource } from '@/lib/types'

/**
 * Shared display ordering for news and resources (used by the public GET
 * endpoints and the admin-data bundle so every view agrees):
 *
 * - News: pinned first; within the pinned group manual `order` asc (date desc
 *   as tiebreak); unpinned strictly by date desc.
 * - Resources: grouped by category (uncategorized last); manual `order` asc
 *   within each group; id (creation order) as tiebreak.
 */
export function compareNews(a: NewsItem, b: NewsItem): number {
  if (a.pinned && !b.pinned) return -1
  if (!a.pinned && b.pinned) return 1
  if (a.pinned && b.pinned) {
    const o = (a.order ?? 0) - (b.order ?? 0)
    if (o !== 0) return o
  }
  return new Date(b.date).getTime() - new Date(a.date).getTime()
}

export function compareResources(a: Resource, b: Resource): number {
  // '￿' (U+FFFF) sorts after any real category id, putting uncategorized last.
  const ca = a.categoryId ?? '￿'
  const cb = b.categoryId ?? '￿'
  if (ca !== cb) return ca < cb ? -1 : 1
  const o = (a.order ?? 0) - (b.order ?? 0)
  if (o !== 0) return o
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}
