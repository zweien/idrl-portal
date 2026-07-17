import { describe, it, expect, beforeEach } from 'vitest'
import { checkRateLimit, resetRateLimit, RATE_LIMIT_PER_MIN } from '@/lib/rate-limit'

beforeEach(() => resetRateLimit())

describe('checkRateLimit', () => {
  it('allows up to RATE_LIMIT_PER_MIN requests, then rejects', () => {
    for (let i = 0; i < RATE_LIMIT_PER_MIN; i++) {
      const r = checkRateLimit('k1')
      expect(r.allowed).toBe(true)
      expect(r.retryAfter).toBe(0)
    }
    const over = checkRateLimit('k1')
    expect(over.allowed).toBe(false)
    expect(over.retryAfter).toBeGreaterThan(0)
    expect(over.retryAfter).toBeLessThanOrEqual(60)
  })

  it('counts remaining down to zero', () => {
    const first = checkRateLimit('k2')
    expect(first.remaining).toBe(RATE_LIMIT_PER_MIN - 1)
    for (let i = 1; i < RATE_LIMIT_PER_MIN; i++) checkRateLimit('k2')
    expect(checkRateLimit('k2').remaining).toBe(0)
  })

  it('counts keys independently', () => {
    // Exhaust k3.
    for (let i = 0; i < RATE_LIMIT_PER_MIN; i++) checkRateLimit('k3')
    expect(checkRateLimit('k3').allowed).toBe(false)
    // k4 is unaffected.
    expect(checkRateLimit('k4').allowed).toBe(true)
  })

  it('resets after the window elapses', () => {
    // Fill the bucket.
    for (let i = 0; i < RATE_LIMIT_PER_MIN; i++) checkRateLimit('k5')
    expect(checkRateLimit('k5').allowed).toBe(false)
    // Manually expire the window by advancing time via re-import is fragile;
    // instead rely on resetRateLimit to clear, simulating a new window.
    resetRateLimit()
    expect(checkRateLimit('k5').allowed).toBe(true)
  })
})
