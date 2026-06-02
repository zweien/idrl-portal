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
