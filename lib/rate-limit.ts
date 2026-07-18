/**
 * Rate limiting for API keys, backed by per-row DB counters so the count is
 * shared across all instances (no per-process Map). Each request does one
 * atomic conditional UPDATE — SQLite's single-writer serialization makes the
 * check-and-increment race-free.
 *
 * Window model: a fixed 60s window starting at rlWindowStart. When the window
 * expires, the first request resets rlCount=1 + rlWindowStart=now. Within the
 * window, an increment succeeds only if rlCount < limit; otherwise the request
 * is rejected with retryAfter = seconds until the window resets.
 */

import { prisma } from '@/lib/db'

/** Global default per-minute limit, used when a key's rateLimitPerMin is NULL. */
export const RATE_LIMIT_DEFAULT = 60
const WINDOW_SECONDS = 60

export interface RateLimitResult {
  allowed: boolean
  /** Seconds until the caller may retry (0 when allowed). */
  retryAfter: number
  /** Remaining requests in the current window (after this call). */
  remaining: number
}

/**
 * Record a request for `keyId` and decide whether it's within the limit.
 * Uses two atomic UPDATEs against the ApiKey row:
 *  1. window-expired reset: rlCount=1, rlWindowStart=now (unconditional on the
 *     count, only requires the window to be over). If it matches → allowed.
 *  2. in-window increment: rlCount=rlCount+1 only if rlCount < limit. If it
 *     matches → allowed; otherwise the limit is exceeded.
 *
 * `limitOverride` lets the caller pass the resolved per-key limit
 * (row.rateLimitPerMin ?? RATE_LIMIT_DEFAULT) to avoid a second read.
 */
export async function checkRateLimit(
  keyId: string,
  limitOverride: number,
): Promise<RateLimitResult> {
  // Window-expired reset. datetime('now') is UTC seconds; comparing against
  // rlWindowStart + 60s detects an expired window. Affected row ⇒ first
  // request of a new window ⇒ allowed, 1 consumed.
  // The '+N seconds' SQLite modifier must be a literal in the SQL string
  // (not a bound parameter), so the constant is baked in here; only keyId is
  // parameterized.
  const resetSql = `UPDATE "ApiKey"
    SET "rlCount" = 1, "rlWindowStart" = datetime('now')
    WHERE "id" = ?
      AND ("rlWindowStart" IS NULL
           OR datetime('now') >= datetime("rlWindowStart", '+${WINDOW_SECONDS} seconds'))`
  const resetChanges = await prisma.$executeRawUnsafe(resetSql, keyId)
  if (resetChanges > 0) {
    return { allowed: true, retryAfter: 0, remaining: Math.max(0, limitOverride - 1) }
  }

  // In-window increment: only succeeds while BOTH under the limit AND the
  // window is still active. Asserting the active window here closes a boundary
  // race: if the window expired between the reset check above and this update,
  // this UPDATE matches 0 rows and we fall through to retry the reset, so the
  // boundary request is counted in the new window instead of being admitted
  // for free.
  const incSql = `UPDATE "ApiKey"
    SET "rlCount" = "rlCount" + 1
    WHERE "id" = ?
      AND "rlCount" < ?
      AND datetime('now') < datetime("rlWindowStart", '+${WINDOW_SECONDS} seconds')`
  const incChanges = await prisma.$executeRawUnsafe(incSql, keyId, limitOverride)
  if (incChanges > 0) {
    return { allowed: true, retryAfter: 0, remaining: 0 }
  }

  // No increment matched. Either the window just expired (between the reset
  // check and the increment) — retry the reset to count this request in the
  // new window — or the limit is genuinely exceeded.
  const resetRetry = await prisma.$executeRawUnsafe(resetSql, keyId)
  if (resetRetry > 0) {
    return { allowed: true, retryAfter: 0, remaining: Math.max(0, limitOverride - 1) }
  }

  // Limit exceeded — read the window start to compute retryAfter.
  const rows = await prisma.$queryRaw<{ rlWindowStart: string | null }[]>`
    SELECT "rlWindowStart" FROM "ApiKey" WHERE "id" = ${keyId}
  `
  const windowStart = rows[0]?.rlWindowStart
  let retryAfter = WINDOW_SECONDS
  if (windowStart) {
    const resetAtMs = new Date(windowStart + 'Z').getTime() + WINDOW_SECONDS * 1000
    retryAfter = Math.max(1, Math.ceil((resetAtMs - Date.now()) / 1000))
  }
  return { allowed: false, retryAfter, remaining: 0 }
}
