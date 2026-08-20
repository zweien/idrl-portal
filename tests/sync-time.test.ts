import { describe, it, expect } from 'vitest'
import { formatRelativeTime } from '@/components/dashboard/sync-time'

describe('formatRelativeTime', () => {
  const now = new Date('2026-08-06T12:00:00+08:00')

  it('returns 刚刚 for < 1 minute', () => {
    expect(formatRelativeTime('2026-08-06T11:59:30+08:00', now)).toBe('刚刚')
    expect(formatRelativeTime('2026-08-06T12:00:00+08:00', now)).toBe('刚刚')
  })

  it('returns 分钟前 for 1–59 minutes', () => {
    expect(formatRelativeTime('2026-08-06T11:59:00+08:00', now)).toBe('1 分钟前')
    expect(formatRelativeTime('2026-08-06T11:05:00+08:00', now)).toBe('55 分钟前')
  })

  it('returns 小时前 for 1–23 hours', () => {
    expect(formatRelativeTime('2026-08-06T11:00:00+08:00', now)).toBe('1 小时前')
    expect(formatRelativeTime('2026-08-06T01:00:00+08:00', now)).toBe('11 小时前')
  })

  it('returns 天前 for >= 24 hours', () => {
    expect(formatRelativeTime('2026-08-05T12:00:00+08:00', now)).toBe('1 天前')
    expect(formatRelativeTime('2026-08-03T12:00:00+08:00', now)).toBe('3 天前')
  })

  it('handles mixed units by flooring (90 min → 1 小时前)', () => {
    expect(formatRelativeTime('2026-08-06T10:30:00+08:00', now)).toBe('1 小时前')
  })
})
