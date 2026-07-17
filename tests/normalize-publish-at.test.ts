import { describe, it, expect } from 'vitest'
import { normalizePublishAt } from '@/lib/db/serialize'

describe('normalizePublishAt', () => {
  it('returns null for empty/unparseable input', () => {
    expect(normalizePublishAt(null)).toBeNull()
    expect(normalizePublishAt(undefined)).toBeNull()
    expect(normalizePublishAt('')).toBeNull()
    expect(normalizePublishAt('not a date')).toBeNull()
  })

  it('normalizes offset-bearing ISO to a canonical UTC "Z" instant', () => {
    // +08:00 10:00 == 02:00Z. Both must normalize to the same UTC instant so
    // the scheduler's string comparison compares instants, not offset strings.
    expect(normalizePublishAt('2026-07-17T10:00:00+08:00')).toBe('2026-07-17T02:00:00.000Z')
    expect(normalizePublishAt('2026-07-17T02:00:00Z')).toBe('2026-07-17T02:00:00.000Z')
  })

  it('produces values comparable against new Date().toISOString()', () => {
    // The scheduler compares publishAt <= now.toISOString(). Both sides must
    // be canonical UTC "Z" strings for the lexicographic comparison to be
    // an instant comparison.
    const a = normalizePublishAt('2026-07-17T10:00:00+08:00')!
    const b = normalizePublishAt('2026-07-17T02:00:00-00:00')!
    expect(a <= b).toBe(true)
    expect(b <= a).toBe(true)
  })
})
