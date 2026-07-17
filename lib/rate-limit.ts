/**
 * In-memory fixed-window rate limiter for API keys. Single-process (matches
 * the current single-server deployment); under multi-replica each instance
 * counts independently — documented limitation, same as the scheduler.
 *
 * One bucket per key id. A window of WINDOW_MS holds up to RATE_LIMIT_PER_MIN
 * requests; the (count+1)th within the window is rejected with retryAfter set
 * to the seconds until the window resets.
 */

export const RATE_LIMIT_PER_MIN = 60
const WINDOW_MS = 60_000

interface Bucket {
  count: number
  resetAt: number // epoch ms
}

// Keyed by ApiKey id. Module-level so it persists across requests in a process.
const buckets = new Map<string, Bucket>()

export interface RateLimitResult {
  allowed: boolean
  /** Seconds until the caller may retry (0 when allowed). */
  retryAfter: number
  /** Remaining requests in the current window (after this call). */
  remaining: number
}

/**
 * Record a request for `keyId` and decide whether it's within the limit.
 * Resets the window lazily when it expires.
 */
export function checkRateLimit(keyId: string): RateLimitResult {
  const now = Date.now()
  let bucket = buckets.get(keyId)
  if (!bucket || now >= bucket.resetAt) {
    // Start a new window.
    bucket = { count: 0, resetAt: now + WINDOW_MS }
    buckets.set(keyId, bucket)
  }
  if (bucket.count >= RATE_LIMIT_PER_MIN) {
    return {
      allowed: false,
      retryAfter: Math.ceil((bucket.resetAt - now) / 1000),
      remaining: 0,
    }
  }
  bucket.count += 1
  return {
    allowed: true,
    retryAfter: 0,
    remaining: Math.max(0, RATE_LIMIT_PER_MIN - bucket.count),
  }
}

/** Test helper: clear all buckets. */
export function resetRateLimit(): void {
  buckets.clear()
}
