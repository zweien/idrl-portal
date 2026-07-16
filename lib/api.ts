'use client'
import useSWR from 'swr'
import type {
  Floor, Person, NewsItem, Resource,
  ApiResponse, PaginatedResponse,
} from '@/lib/types'

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

// ===== Single-item CRUD (Person) =====

export const createPerson = (data: Omit<Person, 'id'>) => postJSON<Person>('/api/personnel', data)
export const updatePerson = (id: string, data: Partial<Person>) => patchJSON<Person>(`/api/personnel/${id}`, data)
export const deletePerson = (id: string) => deleteJSON(`/api/personnel/${id}`)

// ===== Single-item CRUD (NewsItem) =====

export const createNews = (data: Omit<NewsItem, 'id'>) => postJSON<NewsItem>('/api/news', data)
export const updateNews = (id: string, data: Partial<NewsItem>) => patchJSON<NewsItem>(`/api/news/${id}`, data)
export const deleteNews = (id: string) => deleteJSON(`/api/news/${id}`)

// ===== Single-item CRUD (Resource) =====

export const createResource = (data: Omit<Resource, 'id'>) => postJSON<Resource>('/api/resources', data)
export const updateResource = (id: string, data: Partial<Resource>) => patchJSON<Resource>(`/api/resources/${id}`, data)
export const deleteResource = (id: string) => deleteJSON(`/api/resources/${id}`)

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

export function usePersonnel(params?: Record<string, string | number>) {
  return useSWR<ApiResponse<PaginatedResponse<Person>>>(
    `/api/personnel${qs(params)}`,
    fetcher,
  )
}

export function useNews(params?: Record<string, string | number>) {
  return useSWR<ApiResponse<PaginatedResponse<NewsItem>>>(
    `/api/news${qs(params)}`,
    fetcher,
  )
}

export function useResources(params?: Record<string, string | number>) {
  return useSWR<ApiResponse<PaginatedResponse<Resource>>>(
    `/api/resources${qs(params)}`,
    fetcher,
  )
}
