import { describe, it, expect, vi, beforeEach } from 'vitest'

// fetchAll transparently pages past the API's 100-row clamp when the caller
// asked for more — regression for "搜索不到许超": personnel grew to 103 rows,
// the API silently capped pageSize at 100, and everyone past row 100 vanished
// from the personnel board's list AND search.

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

const { fetchAll } = await import('@/lib/api')

type P = { id: string }
const page = (items: P[], total: number, pageN: number, pageSize = 100) => ({
  success: true as const,
  data: { items, total, page: pageN, pageSize, totalPages: Math.ceil(total / pageSize) },
})

beforeEach(() => {
  fetchMock.mockReset()
})

describe('fetchAll (transparent pagination past the API clamp)', () => {
  it('assembles all pages when the requested pageSize exceeds the clamp', async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json(page(
        Array.from({ length: 100 }, (_, i) => ({ id: `p${i}` })), 103, 1,
      )))
      .mockResolvedValueOnce(Response.json(page(
        [{ id: 'p100' }, { id: 'p101' }, { id: 'p102' }], 103, 2,
      )))
    const res = await fetchAll<P>('/api/personnel?pageSize=1000')
    expect(res.data?.items).toHaveLength(103)
    expect(res.data?.items[102]?.id).toBe('p102') // 许超 would be here
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // Follow-up pages reuse the original query and add page=N
    expect(String(fetchMock.mock.calls[1][0])).toBe('/api/personnel?pageSize=1000&page=2')
  })

  it('makes a single request for normal (within-clamp) paginated calls', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(page([{ id: 'a' }], 1, 1, 20)))
    const res = await fetchAll<P>('/api/personnel?page=1&pageSize=20')
    expect(res.data?.items).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not follow up when the first page already holds everything', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(page(
      Array.from({ length: 100 }, (_, i) => ({ id: `p${i}` })), 100, 1,
    )))
    const res = await fetchAll<P>('/api/personnel?pageSize=1000')
    expect(res.data?.items).toHaveLength(100)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keeps accumulated pages when a later page fails', async () => {
    // total=250 → totalPages=3, so the page-3 failure is actually consumed
    // (the previous 105-row fixture had totalPages=2 and never hit the
    // failure path — a false-green test, caught by codex).
    fetchMock
      .mockResolvedValueOnce(Response.json(page(
        Array.from({ length: 100 }, (_, i) => ({ id: `p${i}` })), 250, 1,
      )))
      .mockResolvedValueOnce(Response.json(page(
        Array.from({ length: 100 }, (_, i) => ({ id: `q${i}` })), 250, 2,
      )))
      .mockRejectedValueOnce(new Error('boom'))
    const res = await fetchAll<P>('/api/personnel?pageSize=1000')
    // Page 3 failed: keep pages 1-2 rather than dropping the whole board.
    expect(res.data?.items).toHaveLength(200)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
