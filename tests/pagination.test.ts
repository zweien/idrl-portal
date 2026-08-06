import { describe, it, expect } from 'vitest'
import { parsePagination, paginate, totalPages, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE } from '@/lib/pagination'

function sp(s: Record<string, string>): URLSearchParams {
  return new URLSearchParams(s)
}

describe('parsePagination', () => {
  it('defaults page=1, pageSize=20 when absent', () => {
    expect(parsePagination(sp({}))).toEqual({ page: 1, pageSize: DEFAULT_PAGE_SIZE })
  })
  it('clamps pageSize to MAX_PAGE_SIZE', () => {
    expect(parsePagination(sp({ pageSize: '1000000' })).pageSize).toBe(MAX_PAGE_SIZE)
    expect(parsePagination(sp({ pageSize: '5' })).pageSize).toBe(5)
  })
  it('clamps negative / NaN page to 1', () => {
    expect(parsePagination(sp({ page: '-3' })).page).toBe(1)
    expect(parsePagination(sp({ page: 'abc' })).page).toBe(1)
  })
  it('clamps negative / NaN pageSize to default', () => {
    expect(parsePagination(sp({ pageSize: '-5' })).pageSize).toBe(DEFAULT_PAGE_SIZE)
    expect(parsePagination(sp({ pageSize: 'abc' })).pageSize).toBe(DEFAULT_PAGE_SIZE)
  })
  it('floors fractional values', () => {
    expect(parsePagination(sp({ page: '2.9', pageSize: '3.7' }))).toEqual({ page: 2, pageSize: 3 })
  })
})

describe('paginate', () => {
  const rows = [1, 2, 3, 4, 5, 6, 7]
  it('returns the correct slice for a page', () => {
    expect(paginate(rows, { page: 1, pageSize: 3 })).toEqual([1, 2, 3])
    expect(paginate(rows, { page: 2, pageSize: 3 })).toEqual([4, 5, 6])
    expect(paginate(rows, { page: 3, pageSize: 3 })).toEqual([7])
    expect(paginate(rows, { page: 4, pageSize: 3 })).toEqual([])
  })
})

describe('totalPages', () => {
  it('is at least 1 even for empty lists', () => {
    expect(totalPages(0, 20)).toBe(1)
  })
  it('ceil-divides', () => {
    expect(totalPages(21, 20)).toBe(2)
    expect(totalPages(40, 20)).toBe(2)
    expect(totalPages(100, 20)).toBe(5)
  })
})
