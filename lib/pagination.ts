/**
 * Parse + clamp pagination query params shared by list endpoints.
 *
 * Endpoints previously did `parseInt(searchParams.get('pageSize') || '20')`
 * with no upper bound, so a caller could request pageSize=1_000_000 and force
 * the server to materialize the whole table — a cheap DoS, and unbounded
 * memory. This helper clamps pageSize to [1, MAX], defaults NaN/missing to
 * sane values, and clamps page to >= 1.
 */

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

export interface Pagination {
  page: number
  pageSize: number
}

export function parsePagination(searchParams: URLSearchParams): Pagination {
  const rawPage = parseInt(searchParams.get('page') || '1', 10)
  const rawPageSize = parseInt(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE), 10)

  // NaN (non-numeric input) falls back to defaults; negatives clamp to 1.
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1
  const pageSize = Number.isFinite(rawPageSize) && rawPageSize >= 1
    ? Math.min(Math.floor(rawPageSize), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE

  return { page, pageSize }
}

/** Slice an already-fetched array for the given page (1-indexed). */
export function paginate<T>(rows: T[], { page, pageSize }: Pagination): T[] {
  const start = (page - 1) * pageSize
  return rows.slice(start, start + pageSize)
}

/** Total pages for a count + page size (>= 1, so an empty list is 1 page). */
export function totalPages(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize))
}
