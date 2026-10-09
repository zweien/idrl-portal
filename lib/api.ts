'use client'
import useSWR from 'swr'
import type {
  Floor, Person, NewsItem, Resource,
  Category, ApiKey, SyncLog, UserListItem, AuditLog,
  Feedback, FeedbackReply, FeedbackCategory, FeedbackStatus,
  ApiResponse, PaginatedResponse,
} from '@/lib/types'
import type { SyncTaskState, SyncKind } from '@/lib/sync-task'

const fetcher = <T>(url: string): Promise<T> =>
  fetch(url).then(r => {
    if (!r.ok) {
      return r.json().catch(() => ({})).then((body: { error?: string }) => {
        throw new Error(body.error || `${url}: ${r.status}`)
      })
    }
    return r.json()
  })

export async function putJSON<T>(url: string, body: T): Promise<void> {
  const r = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText }))
    throw new Error(err.error || `PUT ${url} failed: ${r.status}`)
  }
}

/** POST JSON, returning the parsed body (for create endpoints that return the saved entity). */
async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText }))
    throw new Error(err.error || `POST ${url} failed: ${r.status}`)
  }
  return r.json() as Promise<T>
}

/** PATCH JSON, returning the parsed body (for update endpoints). */
async function patchJSON<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText }))
    throw new Error(err.error || `PATCH ${url} failed: ${r.status}`)
  }
  return r.json() as Promise<T>
}

/** DELETE, throwing on non-ok. */
async function deleteJSON(url: string): Promise<void> {
  const r = await fetch(url, { method: 'DELETE' })
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText }))
    throw new Error(err.error || `DELETE ${url} failed: ${r.status}`)
  }
}

// ===== News image upload =====

export interface UploadedImage {
  url: string
  filename: string
  mime: string
}

/**
 * Upload an image file for embedding in news content. Returns the public URL
 * (served by GET /api/uploads/[...path]) to splice into Markdown.
 */
export async function uploadNewsImage(file: File): Promise<UploadedImage> {
  const fd = new FormData()
  fd.append('file', file)
  const r = await fetch('/api/uploads', { method: 'POST', body: fd })
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText }))
    throw new Error(err.error || `上传失败: ${r.status}`)
  }
  return r.json() as Promise<UploadedImage>
}

// ===== Single-item CRUD (Person) =====

export const createPerson = (data: Omit<Person, 'id'>) => postJSON<Person>('/api/personnel', data)
export const updatePerson = (id: string, data: Partial<Person>) => patchJSON<Person>(`/api/personnel/${id}`, data)
export const deletePerson = (id: string) => deleteJSON(`/api/personnel/${id}`)

// ===== Single-item CRUD (NewsItem) =====

export const createNews = (data: Omit<NewsItem, 'id'>) => postJSON<NewsItem>('/api/news', data)
export const updateNews = (id: string, data: Partial<NewsItem>) => patchJSON<NewsItem>(`/api/news/${id}`, data)
export const deleteNews = (id: string) => deleteJSON(`/api/news/${id}`)
/** Rewrite the pinned group's manual order to the given id sequence. */
export const reorderNews = (ids: string[]) => postJSON<{ ok: true }>('/api/news/reorder', { ids })

// ===== Single-item CRUD (Resource) =====

export const createResource = (data: Omit<Resource, 'id'>) => postJSON<Resource>('/api/resources', data)
export const updateResource = (id: string, data: Partial<Resource>) => patchJSON<Resource>(`/api/resources/${id}`, data)
export const deleteResource = (id: string) => deleteJSON(`/api/resources/${id}`)
/** Rewrite one category's manual order to the given id sequence (single category only). */
export const reorderResources = (ids: string[]) => postJSON<{ ok: true }>('/api/resources/reorder', { ids })

// ===== Feedback board (member-writable) =====

export const createFeedback = (data: { content: string; category: FeedbackCategory; contact?: string | null }) =>
  postJSON<Feedback>('/api/feedback', data)
export const deleteFeedback = (id: string) => deleteJSON(`/api/feedback/${id}`)
export const updateFeedbackStatus = (id: string, status: FeedbackStatus) =>
  patchJSON<Feedback>(`/api/feedback/${id}`, { status })
export const createFeedbackReply = (id: string, content: string) =>
  postJSON<FeedbackReply>(`/api/feedback/${id}/replies`, { content })
export const deleteFeedbackReply = (id: string, replyId: string) =>
  deleteJSON(`/api/feedback/${id}/replies/${replyId}`)

// ===== Floor layout =====

export function useFloorLayout() {
  return useSWR<{ floors: Floor[] }>('/api/floor-layout', fetcher)
}

// ===== Admin data =====

export function useAdminData() {
  return useSWR<{ personnel: Person[]; news: NewsItem[]; resources: Resource[] }>(
    '/api/admin-data',
    fetcher,
  )
}

// ===== Read-only paginated endpoints =====

function qs(params?: Record<string, string | number>): string {
  if (!params) return ''
  return '?' + new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  ).toString()
}

// Must stay in sync with MAX_PAGE_SIZE in lib/pagination.ts (the API clamps
// to this). A caller passing a larger pageSize means "give me everything".
const CLIENT_MAX_PAGE_SIZE = 100

/**
 * Fetcher that transparently assembles the full dataset when the caller asked
 * for a pageSize above the API's clamp: the API silently caps pageSize at 100
 * and returns page 1 only, so a plain fetcher drops everything past row 100
 * (personnel grew past 100 and people literally vanished from the board's
 * list and search). Only engages for over-limit requests — normal paginated
 * callers get exactly one request as before.
 */
export const fetchAll = async <T>(url: string): Promise<ApiResponse<PaginatedResponse<T>>> => {
  const first = await fetcher<ApiResponse<PaginatedResponse<T>>>(url)
  const parsed = new URL(url, 'http://localhost')
  const wanted = Number(parsed.searchParams.get('pageSize') ?? 0)
  const d = first.data
  if (!d || wanted <= CLIENT_MAX_PAGE_SIZE || d.items.length >= d.total) return first
  const sep = parsed.search ? '&' : ''
  const items = [...d.items]
  // A failed follow-up page must not blank the board: keep the pages already
  // fetched (partial data beats no data) instead of letting the rejection
  // bubble — SWR would surface an error state and every consumer renders
  // empty. The error is rethrown only when nothing at all was accumulated
  // beyond page 1, which cannot happen here (page 1 succeeded above).
  for (let page = 2; page <= d.totalPages; page++) {
    try {
      const next = await fetcher<ApiResponse<PaginatedResponse<T>>>(
        `${url}${sep}page=${page}`,
      )
      items.push(...(next.data?.items ?? []))
    } catch (e) {
      console.error(`fetchAll: page ${page}/${d.totalPages} failed, keeping ${items.length}/${d.total} items:`, e)
      break
    }
  }
  return { ...first, data: { ...d, items } }
}

/** Progress of the latest sync task (or one specific task by id); polls every 2s while running. */
export function useSyncStatus(taskId?: string | null) {
  const key = taskId ? `/api/sync/status?id=${encodeURIComponent(taskId)}` : '/api/sync/status'
  return useSWR<{ task: SyncTaskState | null }>(
    key,
    fetcher,
    {
      refreshInterval: (latest: { task: SyncTaskState | null } | undefined) =>
        latest?.task?.state === 'running' ? 2000 : 0,
      revalidateOnFocus: false,
    },
  )
}

export function usePersonnel(params?: Record<string, string | number>) {
  return useSWR<ApiResponse<PaginatedResponse<Person>>>(
    `/api/personnel${qs(params)}`,
    fetchAll,
  )
}

export function useNews(params?: Record<string, string | number>) {
  return useSWR<ApiResponse<PaginatedResponse<NewsItem>>>(
    `/api/news${qs(params)}`,
    fetchAll,
  )
}

export function useResources(params?: Record<string, string | number>) {
  return useSWR<ApiResponse<PaginatedResponse<Resource>>>(
    `/api/resources${qs(params)}`,
    fetchAll,
  )
}

// ===== Categories =====

export function useCategories(kind: 'news' | 'resource') {
  return useSWR<ApiResponse<Category[]>>(`/api/categories?kind=${kind}`, fetcher)
}

// ===== Feedback board =====

export function useFeedback(params?: { status?: FeedbackStatus; category?: FeedbackCategory; page?: number; pageSize?: number }) {
  return useSWR<ApiResponse<PaginatedResponse<Feedback>>>(
    `/api/feedback${qs(params as Record<string, string | number> | undefined)}`,
    fetcher,
  )
}

export function useFeedbackDetail(id: string | null) {
  // Conditional key: skip fetch until an id is selected.
  return useSWR<ApiResponse<{ post: Feedback; replies: FeedbackReply[] }>>(
    id ? `/api/feedback/${id}` : null,
    fetcher,
  )
}

// ===== API keys (admin) =====

export function useApiKeys() {
  return useSWR<ApiResponse<ApiKey[]>>('/api/api-keys', fetcher)
}

export async function createApiKey(
  name: string,
  scopes: string[],
  rateLimitPerMin?: number | null,
) {
  const r = await fetch('/api/api-keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, scopes, rateLimitPerMin: rateLimitPerMin ?? null }),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText }))
    throw new Error(err.error || `POST /api/api-keys failed: ${r.status}`)
  }
  return r.json() as Promise<{ id: string; name: string; scopes: string[]; rateLimitPerMin: number; key: string }>
}

export async function updateApiKey(
  id: string,
  patch: { name?: string; scopes?: string[]; rateLimitPerMin?: number | null; resetCounter?: boolean },
) {
  const r = await fetch(`/api/api-keys/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText }))
    throw new Error(err.error || `PATCH /api/api-keys/${id} failed: ${r.status}`)
  }
}

export async function revokeApiKey(id: string) {
  const r = await fetch(`/api/api-keys/${id}`, { method: 'DELETE' })
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText }))
    throw new Error(err.error || `DELETE /api/api-keys/${id} failed: ${r.status}`)
  }
}

// ===== Settings (admin) =====

export function useSettings() {
  return useSWR<ApiResponse<Record<string, string>>>('/api/settings', fetcher)
}

export async function patchSettings(values: Record<string, string>) {
  const r = await fetch('/api/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText }))
    throw new Error(err.error || `PATCH /api/settings failed: ${r.status}`)
  }
}

// ===== Sync logs (admin) =====

export function useSyncLogs(job?: string, limit = 50) {
  const qs = job ? `?job=${job}&limit=${limit}` : `?limit=${limit}`
  return useSWR<ApiResponse<SyncLog[]>>(`/api/sync-logs${qs}`, fetcher)
}

// ===== Attendance sync freshness (member-readable) =====

/** Response of GET /api/attendance/synced-at — when sync-attendance last ran. */
export interface SyncedAt {
  lastSyncAt: string | null
  status: 'success' | 'error' | null
}

/**
 * Polls the attendance-sync freshness signal. 60s refreshInterval both pulls
 * newer sync runs and re-renders the relative time ("3 分钟前") as it ages.
 */
export function useSyncedAt() {
  return useSWR<ApiResponse<SyncedAt>>(
    '/api/attendance/synced-at',
    fetcher,
    { refreshInterval: 60_000 },
  )
}

// ===== Users (admin) =====

export function useUsers() {
  return useSWR<ApiResponse<UserListItem[]>>('/api/users', fetcher)
}

export async function updateUser(
  id: string,
  patch: { role?: 'admin' | 'member'; personId?: string | null; disabled?: boolean },
) {
  const r = await fetch(`/api/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText }))
    throw new Error(err.error || `PATCH /api/users/${id} failed: ${r.status}`)
  }
}

// ===== Audit logs (admin) =====

export function useAuditLogs(params?: Record<string, string | number>) {
  return useSWR<ApiResponse<PaginatedResponse<AuditLog & { actorName?: string }>>>(
    `/api/audit-logs${qs(params)}`,
    fetcher,
  )
}

// ===== Attendance history & stats =====

export interface LeaderboardEntry {
  personId: string
  name: string
  checkIn?: string | null
  workMinutes?: number | null
}
export interface LeaderboardData {
  type: 'today' | 'monthly'
  items: LeaderboardEntry[]
  date?: string
  from?: string
  to?: string
}

export interface AttendanceRecordItem {
  id: string
  date: string
  checkIn?: string | null
  checkOut?: string | null
  status: 'present' | 'leave' | 'trip' | 'absent'
  workMinutes: number | null
}

export function useLeaderboard(type: 'today' | 'monthly', limit = 10) {
  return useSWR<ApiResponse<LeaderboardData>>(
    `/api/attendance/leaderboard?type=${type}&limit=${limit}`,
    fetcher,
  )
}

export function useAttendanceRecords(params?: Record<string, string | number> | null) {
  // Passing null params disables the fetch (SWR conditional pattern).
  const key = params === null ? null : `/api/attendance/records${qs(params ?? undefined)}`
  return useSWR<ApiResponse<PaginatedResponse<AttendanceRecordItem>>>(
    key,
    fetcher,
  )
}
