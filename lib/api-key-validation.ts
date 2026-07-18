/**
 * Validate an optional per-key rate limit. Accepts:
 *  - null / undefined / '' → null (use the global default)
 *  - a positive integer (number or numeric string) → that integer
 *
 * Rejects (throws) prefix-numeric strings like "10abc" or "1.5" — parseInt
 * would silently coerce these, but the API contract is "positive integer or
 * null". Also rejects non-integer numbers (1.5) and non-positive values.
 */
export function parseRateLimit(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  // For strings, require the WHOLE string to be an integer (no "10abc").
  if (typeof v === 'string') {
    if (!/^\d+$/.test(v.trim())) {
      throw new Error('rateLimitPerMin must be a positive integer or null')
    }
    const n = Number(v)
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error('rateLimitPerMin must be a positive integer or null')
    }
    return n
  }
  if (typeof v === 'number') {
    if (!Number.isInteger(v) || v <= 0) {
      throw new Error('rateLimitPerMin must be a positive integer or null')
    }
    return v
  }
  throw new Error('rateLimitPerMin must be a positive integer or null')
}
